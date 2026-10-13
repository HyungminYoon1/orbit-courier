import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as model from "../dist/src/model.js";
import * as records from "../dist/src/records.js";
import { rng, cleanSeed } from "../dist/src/core.js";
import { flightFeedback } from "../dist/src/feedback.js";

const source = await readFile(new URL("../dist/src/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

// Actual handlers with a small DOM double: no rendering/browser claims.
function boot() {
  class Element {
    constructor() { this.value = ""; this.children = []; this.checked = true; this.step = "0.5"; }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    get options() { return this.children; }
    getContext() { return new Proxy({}, { get: (_, key) => key === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}, set: () => true }); }
  }
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  elements.burnAt.step = "0.05"; elements.playback.value = "4";
  let writable = true;
  runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
    ...model, ...records, rng, cleanSeed, flightFeedback, $: id => elements[id],
    freshSeed: () => "start", loadLocal: () => ({}), saveLocal: () => writable,
    announce: message => { elements.notice.textContent = message; },
    document: { createElement: () => new Element(), createElementNS: () => new Element(), addEventListener() {} },
    tool() {}, addEventListener() {}, cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  });
  return { elements, blockStorage: () => { writable = false; } };
}

test("correcting an invalid mission code clears its error, while a new storage failure stays visible", () => {
  const ui = boot(), e = ui.elements;
  e.seed.value = "잘못된코드"; e["apply-seed"].onclick();
  assert.match(e.notice.textContent, /도전 코드/);
  assert.equal(e["resume-copy"].textContent, "마지막 코드 start · 임무 1");
  e.seed.value = "valid-code"; e["apply-seed"].onclick();
  assert.equal(e.seed.value, "valid-code");
  assert.equal(e.notice.textContent, "");
  ui.blockStorage();
  e.seed.value = "another-code"; e["apply-seed"].onclick();
  assert.match(e.notice.textContent, /저장 불가/);
});
