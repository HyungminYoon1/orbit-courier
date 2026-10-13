import test from "node:test";
import assert from "node:assert/strict";
import { makeSector, simulate, flightScore, LIMITS, DT, segmentHit } from "../dist/src/model.js";
import { cleanSeed, loadLocal } from "../dist/src/core.js";
import { normalizeRecord, rememberMission } from "../dist/src/records.js";

test("edge: every launch field accepts exact endpoints and rejects just-outside, type and nonfinite values", () => {
  const s = makeSector(1, "edge"), p = s.reference;
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    for (const v of [min, max]) {
      const q = { ...p, [field]: v };
      assert.ok(Number.isFinite(simulate(s, q.angle, q.power, q).time));
    }
    for (const v of [min - 0.001, max + 0.001, "", false, "20", NaN, Infinity, -Infinity]) {
      const q = { ...p, [field]: v };
      assert.throws(() => simulate(s, q.angle, q.power, q), TypeError, field);
    }
  }
  assert.equal(cleanSeed(" a "), "a");
  assert.equal(cleanSeed("a".repeat(40)).length, 40);
  for (const v of ["", " ", "가", "a".repeat(41), null, 1]) assert.throws(() => cleanSeed(v));
});

test("edge: burn quantization, zero burn and post-terminal burn preserve fuel provenance", () => {
  const s = makeSector(1, "edge"), p = s.reference;
  const zero = simulate(s, p.angle, 100, { burn: 0, burnAt: 0 });
  assert.deepEqual(zero.events, []);
  assert.equal(zero.fuel, 100);
  const late = simulate(s, p.angle, 100, { burn: 80, burnAt: 20 });
  assert.equal(late.status, "success");
  assert.deepEqual(late.events, []);
  assert.equal(late.fuel, 100);
  const early = simulate(s, p.angle, 100, { burn: 1, burnAt: DT * 0.49 });
  const rounded = simulate(s, p.angle, 100, { burn: 1, burnAt: DT * 0.51 });
  assert.equal(early.events[0].t, 0);
  assert.equal(rounded.events[0].t, DT);
  assert.equal(early.events.filter(e => e.type === "burn").length, 1);
});

test("edge: scoring has exact independent rounding and floor at maximum attempts", () => {
  const result = { status: "success", fuel: 100.25, time: 2.125 };
  assert.equal(flightScore(result, 20, 1), 1287);
  assert.equal(flightScore(result, 320, 2, true), 1122);
  assert.equal(flightScore(result, 320, 1000000, true), 50);
  assert.equal(flightScore({ ...result, status: "timeout" }, 320, 1000000), 0);
});

test("edge: MRU snapshots detach input aliases and keep score boundaries and completion uniqueness", () => {
  const plan = { angle: -180, power: 20, burn: -80, burnAt: 0 };
  const original = normalizeRecord({ unlocked: 6, best: { "min-1": 50, "max-6": 1500, "bad-1": 49 }, completed: [6, 6, 1] });
  const next = rememberMission(original, { seed: "a".repeat(40), stage: 6, attempts: 1000000, hinted: true, plan });
  plan.angle = 0;
  assert.equal(next.recent[0].plan.angle, -180);
  assert.deepEqual(original.recent, []);
  assert.deepEqual(next.best, { "min-1": 50, "max-6": 1500 });
  assert.deepEqual(next.completed, [1, 6]);
  assert.deepEqual(normalizeRecord(next), next);
});

test("edge: bounded JSON accepts the exact read limit and denies the next character", t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let raw = "{}" + " ".repeat(65534);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => raw } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, "localStorage", prior); else delete globalThis.localStorage; });
  assert.deepEqual(loadLocal("orbit-courier-v2", "fallback"), {});
  raw += " ";
  assert.equal(loadLocal("orbit-courier-v2", "fallback"), "fallback");
});

test("edge: swept contact distinguishes stationary outside and exact endpoint contact", () => {
  const circle = { x: 5, y: 0, radius: 1 };
  assert.equal(segmentHit({ x: 0, y: 0 }, { x: 0, y: 0 }, circle), null);
  assert.equal(segmentHit({ x: 0, y: 0 }, { x: 4, y: 0 }, circle), 1);
  assert.equal(segmentHit({ x: 0, y: 0 }, { x: 3.999, y: 0 }, circle), null);
});
