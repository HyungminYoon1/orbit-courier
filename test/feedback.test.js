import test from "node:test";
import assert from "node:assert/strict";
import { makeSector, simulate } from "../dist/src/model.js";
import { flightFeedback } from "../dist/src/feedback.js";

test("orbit graph uses actual timed samples, analytic target and signed errors without mutating physics", () => {
  const scene = makeSector(1, "graph"), r = simulate(scene, scene.reference.angle, 100);
  const snapshot = structuredClone(r), data = flightFeedback(scene, r);
  assert.equal(r.status, "success");
  assert.equal(data.target, 120);
  assert.deepEqual(data.band, [112.8, 127.2]);
  assert.equal(data.points.length, r.path.length);
  assert.deepEqual(data.points[0], { t: 0, observed: 120, error: 0 });
  for (let i = 0; i < data.points.length; i++) {
    assert.equal(data.points[i].t, r.path[i].t);
    assert.equal(data.points[i].error, r.path[i].metrics.radius - 120);
  }
  assert.ok(data.maxAbsoluteError < 0.004);
  assert.deepEqual(r, snapshot);
});

test("elliptic failure explains unmet eccentricity and continuous turns even when radius enters target band", () => {
  const s = makeSector(1, "graph"), r = simulate(s, s.reference.angle, 110);
  const d = flightFeedback(s, r);
  assert.equal(r.status, "timeout");
  assert.match(d.diagnosis, /이심률/);
  assert.match(d.diagnosis, /연속 회전/);
  assert.ok(d.points.some((p) => Math.abs(p.error) <= 7.2));
  assert.ok(d.maxAbsoluteError > 7.2);
});

test("delivery distance measures station rather than primary radius and reports actual arrival speed", () => {
  const s = { start: { x: 100, y: 100 }, bodies: [{ x: 450, y: 400, mass: 1, radius: 20 }], mission: { type: "delivery" }, target: { x: 200, y: 100, radius: 20, maxSpeed: 100 } };
  const r = simulate(s, 0, 200), d = flightFeedback(s, r);
  assert.notEqual(r.status, "success");
  assert.equal(d.points[0].observed, 100);
  assert.equal(d.points[0].error, 80);
  const arrival = r.events.find((e) => e.type === "arrival");
  assert.ok(arrival.speed > 100);
  assert.ok(Math.abs(arrival.t - 0.4) < 0.00001);
  assert.match(d.diagnosis, /진입 속도 200\.0 > 100/);
  const good = simulate(s, 0, 150, { burn: -70, burnAt: 0.2 });
  assert.equal(good.status, "success");
  assert.ok(good.events.find((e) => e.type === "arrival").speed <= 100);
});

test("escape boundary is a radius threshold; graph alone cannot certify nonpositive-energy flight", () => {
  const s = makeSector(2, "graph"), r = simulate(s, s.reference.angle, 140), d = flightFeedback(s, r);
  assert.notEqual(r.status, "success");
  assert.equal(d.target, 240);
  assert.equal(d.band, null);
  assert.ok(d.points.some((p) => p.error > 0));
  assert.match(d.diagnosis, /E .*\(>0 필요\)/);
});

test("collision at launch and missed delivery have bounded, finite feedback without invented telemetry", () => {
  const s = makeSector(1, "graph"); s.start = { x: s.bodies[0].x, y: s.bodies[0].y };
  const d = flightFeedback(s, simulate(s, 0, 100));
  assert.deepEqual(d.points, []);
  assert.equal(d.endError, null);
  assert.match(d.diagnosis, /시작점/);
  const missed = makeSector(3, "graph"), r = simulate(missed, 0, 100);
  assert.match(flightFeedback(missed, r).diagnosis, /충돌|최근접 표본 거리/);
});
