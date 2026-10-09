import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecord, rememberMission, recordCompletion, RECENT_LIMIT, BEST_LIMIT } from "../dist/src/records.js";
import { makeSector, simulate, flightScore } from "../dist/src/model.js";
import { loadLocal, saveLocal } from "../dist/src/core.js";
import { PROGRESS_KEY, APP_IDS, normalizeProgress, publishProgress, clearProgress } from "../dist/src/progress.js";

const checkpoint = (seed, stage = 1) => ({ seed, stage, plan: makeSector(stage, seed).defaults, attempts: 2, hinted: true });
const legalRun = (stage, seed) => {
  const scene = makeSector(stage, seed);
  const plan = Object.fromEntries(Object.entries(scene.reference).map(([k, v]) => [k, Math.round(v / (k === "burnAt" ? 0.05 : 0.5)) * (k === "burnAt" ? 0.05 : 0.5)]));
  const result = simulate(scene, plan.angle, plan.power, plan);
  assert.equal(result.status, "success");
  return { result, score: flightScore(result, plan.power, 1) };
};

test("bounded recent codes are unique MRU; restore code, mission, attempts, hints and inputs", () => {
  let record = normalizeRecord({ unlocked: 4 });
  for (let i = 0; i < 12; i++) record = rememberMission(record, checkpoint(`code-${i}`, 4));
  assert.equal(record.recent.length, RECENT_LIMIT);
  assert.equal(record.recent[0].seed, "code-11");
  const before = structuredClone(record);
  const restored = normalizeRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(restored, before);
  record = rememberMission(record, { ...checkpoint("code-6", 3), attempts: 7 });
  assert.equal(record.recent[0].stage, 3);
  assert.equal(record.recent[0].attempts, 7);
  assert.equal(record.recent[0].hinted, true);
  assert.equal(record.recent.filter((r) => r.seed === "code-6").length, 1);
  assert.deepEqual(before.recent[0], restored.recent[0]);
});

test("legacy v2 unlock and seed-specific best survive without inventing independent achievements", () => {
  const record = normalizeRecord({ unlocked: 5, best: { "first-2": 1000, "second-2": 1100 } });
  assert.equal(record.unlocked, 5);
  assert.equal(record.best["first-2"], 1000);
  assert.equal(record.best["second-2"], 1100);
  assert.deepEqual(record.completed, []);
  assert.deepEqual(record.recent, []);
});

test("malformed local fields, locked checkpoints and extra private payload are rejected or projected out", () => {
  for (const input of [null, [], "bad", 7]) assert.deepEqual(normalizeRecord(input), normalizeRecord({}));
  const record = normalizeRecord({ unlocked: 2, recent: [
    checkpoint("valid", 2), checkpoint("locked", 3), { ...checkpoint("bad"), seed: "<script>" },
    { ...checkpoint("valid-2"), plan: { angle: Infinity }, attempts: -5, hinted: "false", extra: "private" },
  ], best: { "ok-1": 800, "bad-9": 800, "fraction-1": 50.5, "small-1": 1, "large-1": 1501 }, completed: [1, 1, 7, "2", 2] });
  assert.deepEqual(record.best, { "ok-1": 800 });
  assert.deepEqual(record.completed, [1, 2]);
  assert.equal(record.recent.length, 2);
  assert.equal(record.recent[1].attempts, 0);
  assert.equal(record.recent[1].hinted, false);
  assert.equal(record.recent[1].plan, undefined);
  assert.equal(JSON.stringify(record).includes("private"), false);
  assert.throws(() => rememberMission(record, checkpoint("locked", 3)));
  assert.throws(() => rememberMission(record, { ...checkpoint("bad"), plan: { angle: NaN } }));
});

test("actual six-mission legal campaign records durable independent achievements; repeats cannot inflate count", () => {
  let record = normalizeRecord({});
  for (let stage = 1; stage <= 6; stage++) {
    const { result, score } = legalRun(stage, "campaign");
    record = recordCompletion(record, "campaign", stage, result, score, false);
  }
  assert.equal(record.unlocked, 6);
  assert.deepEqual(record.completed, [1, 2, 3, 4, 5, 6]);
  const first = legalRun(1, "campaign");
  record = recordCompletion(record, "campaign", 1, first.result, first.score, false);
  assert.equal(record.completed.length, 6);
  assert.deepEqual(normalizeRecord(JSON.parse(JSON.stringify(record))), record);
});

test("hint/example success unlocks normally but fails the independent gate; failed flights never record success", () => {
  const original = normalizeRecord({});
  const { result, score } = legalRun(1, "assisted");
  const assisted = recordCompletion(original, "assisted", 1, result, score, true);
  assert.equal(assisted.unlocked, 2);
  assert.equal(assisted.best["assisted-1"], score);
  assert.deepEqual(assisted.completed, []);
  const s = makeSector(1, "assisted"), failed = simulate(s, s.reference.angle, 110);
  assert.notEqual(failed.status, "success");
  assert.deepEqual(recordCompletion(original, "assisted", 1, failed, 0, false), original);
  assert.deepEqual(original.best, {});
  assert.throws(() => recordCompletion(original, "bad", 2, result, score, false));
  assert.throws(() => recordCompletion(original, "bad", 1, result, 1501, false));
});

test("best records stay bounded and do not mix codes", () => {
  let record = normalizeRecord({});
  for (let i = 0; i < 120; i++) {
    const { result, score } = legalRun(1, `code-${i}`);
    record = recordCompletion(record, `code-${i}`, 1, result, score, false);
  }
  assert.equal(Object.keys(record.best).length, BEST_LIMIT);
  assert.equal(record.best["code-0-1"], undefined);
  const s = makeSector(1, "code-119"), result = simulate(s, s.reference.angle, 100);
  const score = flightScore(result, 100, 1);
  record = recordCompletion(record, "code-119", 1, result, flightScore(result, 100, 100), false);
  assert.equal(record.best["code-119-1"], score);
});

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}
const now = "2026-10-09T03:00:00.000Z";
const other = { completed: 2, total: 12, updatedAt: now };

test("summary read-modify-write and own clear preserve other app aggregates, omit run data", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, apps: { "light-route": { ...other, seed: "private" }, unknown: other } }));
  const run = legalRun(1, "private-run");
  const record = recordCompletion(normalizeRecord({}), "private-run", 1, run.result, run.score, false);
  assert.equal(publishProgress(storage, record.completed.length, 6, now), true);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)), { version: 1, apps: {
    "light-route": other, "orbit-courier": { completed: 1, total: 6, updatedAt: now },
  } });
  assert.equal(clearProgress(storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)), { version: 1, apps: { "light-route": other } });
  assert.equal(storage.getItem(PROGRESS_KEY).includes("private"), false);
  assert.equal(APP_IDS.length, 15);
  assert.equal(new Set(APP_IDS).size, 15);
});

test("summary validates integer counts, ISO times, whitelist and payload size; corrupt/blocked writes fail safely", () => {
  const storage = new MemoryStorage();
  for (const [completed, total, time] of [[-1, 6, now], [7, 6, now], [1.5, 6, now], [0, 1001, now], [1, 6, "yesterday"], [1, 6, "2026-02-30T00:00:00.000Z"]]) {
    assert.equal(publishProgress(storage, completed, total, time), false);
    assert.equal(storage.getItem(PROGRESS_KEY), null);
  }
  for (const raw of ["{", JSON.stringify({ version: 2, apps: {} }), "x".repeat(8193)]) {
    storage.setItem(PROGRESS_KEY, raw);
    assert.equal(publishProgress(storage, 1, 6, now), false);
    assert.equal(clearProgress(storage), false);
    assert.equal(storage.getItem(PROGRESS_KEY), raw);
  }
  assert.equal(publishProgress({ getItem() { throw Error("blocked"); } }, 1, 6, now), false);
  assert.equal(publishProgress({ getItem() { return null; }, setItem() { throw Error("quota"); } }, 1, 6, now), false);
  const apps = Object.fromEntries(APP_IDS.map((id) => [id, other]));
  apps["orbit-courier"] = { completed: 8, total: 6, updatedAt: now };
  assert.equal(Object.keys(normalizeProgress({ version: 1, apps }).apps).length, 14);
});

test("private storage read is bounded; malformed JSON and unavailable storage fail without leaking contents", (t) => {
  const storage = new MemoryStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage; });
  const fallback = normalizeRecord({});
  for (const raw of ["{", "x".repeat(65537)]) {
    storage.setItem("test-key", raw);
    assert.deepEqual(loadLocal("test-key", fallback), fallback);
  }
  storage.setItem("test-key", JSON.stringify({ unlocked: 2 }));
  assert.deepEqual(loadLocal("test-key", fallback), { unlocked: 2 });
  storage.setItem = () => { throw Error("quota"); };
  assert.equal(saveLocal("test-key", fallback), false);
});
