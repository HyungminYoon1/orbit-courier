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
function boot(saved = {}) {
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
  const writes = [], frames = new Map();
  let frameId = 0;
  runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
    ...model, ...records, rng, cleanSeed, flightFeedback, $: id => elements[id],
    freshSeed: () => "start", loadLocal: () => saved, saveLocal: (_, value) => { writes.push(structuredClone(value)); return writable; },
    announce: message => { elements.notice.textContent = message; },
    document: { createElement: () => new Element(), createElementNS: () => new Element(), addEventListener() {} },
    tool() {}, addEventListener() {}, cancelAnimationFrame: id => frames.delete(id),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
  });
  return { elements, writes, frames, blockStorage: () => { writable = false; } };
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

test("edge: IME composition and held Space must not launch or pause a flight", () => {
  const ui = boot(), e = ui.elements;
  for (const event of [{ key: " ", isComposing: true }, { key: " ", repeat: true }, { key: "ArrowRight", isComposing: true }]) {
    const before = [e.angle.value, e.power.value, ui.writes.length];
    e.space.onkeydown({ preventDefault() {}, ...event });
    assert.equal(e["flight-state"].textContent, "발사 준비");
    assert.deepEqual([e.angle.value, e.power.value, ui.writes.length], before);
  }
  e.space.onkeydown({ key: " ", preventDefault() {} });
  assert.equal(e["flight-state"].textContent, "비행 중");
  e.space.onkeydown({ key: " ", repeat: true, preventDefault() {} });
  assert.equal(e["flight-state"].textContent, "비행 중");
});

test("edge: restore caps attempts and preserves assistance until explicit reset", () => {
  const saved = records.normalizeRecord({ unlocked: 2, completed: [1], best: { "resume-1": 900 }, recent: [
    { seed: "resume", stage: 2, attempts: 1000000, hinted: true, plan: model.makeSector(2, "resume").reference },
  ] });
  const ui = boot(saved), e = ui.elements;
  assert.equal(e.seed.value, "resume");
  assert.equal(e["flight-state"].textContent, "발사 준비");
  assert.match(e.status.textContent, /힌트 사용/);
  e.launch.onclick(); e.launch.onclick(); e.launch.onclick();
  assert.equal(e.attempts.textContent, "1000000");
  assert.equal(ui.frames.size, 1);
  e.reset.onclick();
  assert.equal(ui.frames.size, 0);
  assert.equal(e.attempts.textContent, "00");
  assert.equal(ui.writes.at(-1).recent[0].hinted, false);
  assert.deepEqual(ui.writes.at(-1).completed, [1]);
  assert.equal(ui.writes.at(-1).best["resume-1"], 900);
});

test("edge: invalid code during playback leaves the current flight and checkpoint untouched", () => {
  const ui = boot(), e = ui.elements;
  e.launch.onclick();
  const before = ui.writes.length;
  e.seed.value = "x".repeat(41); e["apply-seed"].onclick();
  assert.equal(e["flight-state"].textContent, "비행 중");
  assert.equal(ui.writes.length, before);
  assert.equal(ui.frames.size, 1);
  e.retry.onclick();
  assert.equal(ui.frames.size, 0);
});
