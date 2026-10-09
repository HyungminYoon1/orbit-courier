import test from "node:test";
import assert from "node:assert/strict";
import { makeSector, simulate, flightScore, acceleration, orbitalMetrics, segmentHit, DT, MAX_STEPS } from "../dist/src/model.js";

const run = (s, p = s.reference) => simulate(s, p.angle, p.power, p);
const roundPlan = (p) => ({ angle: Math.round(p.angle * 2) / 2, power: Math.round(p.power * 2) / 2, burn: Math.round(p.burn * 2) / 2, burnAt: Math.round(p.burnAt * 20) / 20 });
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const simpleDelivery = () => ({
  start: { x: 100, y: 100 }, bodies: [{ x: 450, y: 400, mass: 1, radius: 20 }],
  mission: { type: "delivery" }, target: { x: 200, y: 100, radius: 20, maxSpeed: 100 },
});

test("60 authored missions are deterministic, immutable and solvable at UI precision", () => {
  const variants = new Set();
  for (let stage = 1; stage <= 6; stage++) for (let i = 0; i < 10; i++) {
    const scene = makeSector(stage, "test-" + i), snapshot = structuredClone(scene);
    assert.deepEqual(scene, makeSector(stage, "test-" + i));
    variants.add(scene.variant + scene.bodies[0].x);
    const plan = roundPlan(scene.reference), result = run(scene, plan);
    assert.equal(result.status, "success", `${stage}/test-${i}: ${result.reason}`);
    assert.ok(flightScore(result, plan.power, 1) > 0);
    assert.deepEqual(scene, snapshot);
    assert.ok(result.path.length <= MAX_STEPS / 2 + 2);
  }
  assert.ok(variants.size >= 6);
});

test("inverse-square gravity and vector superposition have analytic values", () => {
  const a = { x: 0, y: 0, mass: 1000, radius: 1 };
  const scene = { bodies: [a] };
  close(acceleration(scene, { x: 10, y: 0 }).x, -10);
  close(acceleration(scene, { x: 20, y: 0 }).x, -2.5);
  close(acceleration(scene, { x: 10, y: 0 }).y, 0);
  const b = { x: 10, y: 10, mass: 1000, radius: 1 };
  const both = acceleration({ bodies: [a, b] }, { x: 10, y: 0 });
  close(both.x, -10); close(both.y, 10);
  assert.throws(() => acceleration(scene, { x: 0, y: 0 }), RangeError);
});

test("circular speed, energy and eccentricity match two-body analytic equations", () => {
  const scene = makeSector(1, "lab");
  const p = { ...scene.start, vx: 0, vy: -100 };
  const m = orbitalMetrics(scene, p);
  close(m.circularSpeed, 100); close(m.energy, -5000); close(m.eccentricity, 0); close(m.radialSpeed, 0);
  const result = simulate(scene, -90, 100);
  assert.equal(result.status, "success");
  const period = 2 * Math.PI * Math.sqrt(120 ** 3 / 1200000);
  assert.ok(result.time >= period && result.time < period + 3 * DT);
  assert.ok(result.metrics.turns >= 1);
  assert.ok(result.metrics.maxEnergyError < 1e-7);
  assert.ok(result.path.every((p) => Math.abs(p.metrics.radius - 120) < 0.004));
  assert.equal(simulate(scene, 90, 100).status, "success");
});

test("an eccentric bound orbit and radial launch do not count as circular orbit", () => {
  const scene = makeSector(1, "lab");
  const ellipse = simulate(scene, -90, 110);
  assert.equal(ellipse.status, "timeout");
  assert.ok(ellipse.metrics.energy < 0);
  assert.ok(ellipse.path.some((p) => p.metrics.eccentricity > scene.mission.maxEccentricity));
  assert.equal(ellipse.metrics.turns, 0);
  assert.notEqual(simulate(scene, 0, 100).status, "success");
});

test("breaking the orbit band resets previously accumulated progress", () => {
  const scene = makeSector(1, "lab"), result = simulate(scene, -90, 100, { burn: 20, burnAt: 3 });
  assert.notEqual(result.status, "success");
  assert.ok(result.path.some((p) => p.metrics.turns > 0.3));
  assert.ok(result.path.some((p) => p.t > 3.1 && p.metrics.turns === 0));
});

test("escape requires positive conserved energy, outward motion and boundary", () => {
  const scene = makeSector(2, "lab"), positive = simulate(scene, -90, 170);
  assert.equal(positive.status, "success");
  assert.ok(positive.metrics.radius >= scene.mission.radius);
  assert.ok(positive.metrics.radialSpeed > 0 && positive.metrics.conservedEnergy > 0);
  const bound = simulate(scene, -90, 140);
  assert.ok(bound.path.some((p) => p.metrics.radius > scene.mission.radius));
  assert.notEqual(bound.status, "success");
  const parabolic = simulate(scene, -90, Math.sqrt(2 * 1200000 / 100));
  close(parabolic.metrics.conservedEnergy, 0, 1e-8);
  assert.notEqual(parabolic.status, "success", "integrator energy drift must not turn E=0 into success");
  const inward = simulate(scene, 180, 180);
  assert.equal(inward.status, "collision");
});

test("multi-body energy sums every potential; force changes the same launch", () => {
  const scene = makeSector(4, "lab"), withNeighbor = run(scene);
  const solo = structuredClone(scene); solo.bodies.pop();
  const alone = run(solo);
  assert.equal(withNeighbor.status, "success");
  assert.notEqual(withNeighbor.time, alone.time);
  assert.ok(withNeighbor.metrics.eccentricity > alone.metrics.eccentricity + 0.01);
  close(orbitalMetrics(scene, { ...scene.start, vx: 0, vy: 100 }).energy, -5000 - 24000 / 220);
  assert.ok(withNeighbor.metrics.maxEnergyError < 0.00001);
});

test("swept collision catches crossing, tangent, overlap and miss", () => {
  const c = { x: 50, y: 0, radius: 5 };
  close(segmentHit({ x: 0, y: 0 }, { x: 100, y: 0 }, c), 0.45);
  close(segmentHit({ x: 0, y: 5 }, { x: 100, y: 5 }, c), 0.5);
  assert.equal(segmentHit({ x: 50, y: 0 }, { x: 50, y: 0 }, c), 0);
  assert.equal(segmentHit({ x: 0, y: 6 }, { x: 100, y: 6 }, c), null);
});

test("ship radius collision stops at surface before a station behind it", () => {
  const scene = simpleDelivery(); scene.bodies[0] = { x: 150, y: 100, mass: 1, radius: 20 };
  const result = simulate(scene, 0, 200);
  assert.equal(result.status, "collision"); close(result.path.at(-1).x, 125, 0.001);
  scene.start = { x: 150, y: 100 };
  const overlap = simulate(scene, 0, 200);
  assert.equal(overlap.status, "collision"); assert.equal(overlap.time, 0);
});

test("delivery requires geometry AND arrival speed; a fly-through is insufficient", () => {
  const scene = simpleDelivery();
  assert.equal(simulate(scene, 0, 80).status, "success");
  const fast = simulate(scene, 0, 200);
  assert.notEqual(fast.status, "success"); assert.match(fast.reason, /속도/);
  scene.target.y = 200;
  assert.notEqual(simulate(scene, 0, 80).status, "success");
});

test("scheduled retrograde burn can bring a delivery under its speed cap", () => {
  const scene = simpleDelivery();
  const result = simulate(scene, 0, 150, { burn: -70, burnAt: 0.2 });
  assert.equal(result.status, "success"); assert.ok(result.metrics.speed < 100);
  assert.equal(result.events.filter((e) => e.type === "burn").length, 1);
  close(result.events[0].t, 0.2); close(result.events[0].deltaV, -70);
  assert.ok(result.metrics.maxEnergyError < 1e-7);
});

test("retrograde burn stops at zero instead of reversing the craft", () => {
  const scene = simpleDelivery(), result = simulate(scene, 0, 20, { burn: -80, burnAt: 0 });
  close(result.events[0].deltaV, -20);
  close(result.fuel, 40);
  assert.ok(result.path[1].vx >= 0);
});

test("flyby requires near pass, exit, turn AND eventual delivery", () => {
  const scene = makeSector(5, "lab"), success = run(scene);
  assert.equal(success.status, "success"); assert.ok(success.metrics.flyby);
  assert.ok(success.metrics.turn >= 20); assert.equal(success.events.filter((e) => e.type === "flyby").length, 1);
  assert.ok(success.events[0].t < success.time);
  for (const change of [s => { s.mission.minTurn = 120; }, s => { s.mission.near = 40; }, s => { s.target.y = 520; }]) {
    const altered = structuredClone(scene); change(altered);
    assert.notEqual(run(altered).status, "success");
  }
  const noPass = simpleDelivery(); noPass.mission = { type: "flyby", body: 0, near: 100, exit: 140, minTurn: 20 };
  assert.notEqual(simulate(noPass, 0, 80).status, "success");
});

test("a burn inside flyby cannot fake gravity-only deflection", () => {
  const scene = makeSector(5, "lab"), baseline = run(scene);
  const inside = baseline.path.find(p => p.metrics.near);
  const result = run(scene, { ...scene.reference, burn: 0.5, burnAt: inside.t });
  assert.notEqual(result.status, "success"); assert.equal(result.metrics.flyby, false);
});

test("transfer needs timed circularization; coasting ellipse is not a success", () => {
  const scene = makeSector(6, "lab");
  assert.equal(run(scene, roundPlan(scene.reference)).status, "success");
  const coast = run(scene, { ...scene.reference, burn: 0 });
  assert.equal(coast.status, "timeout");
  assert.ok(coast.path.some(p => Math.abs(p.metrics.radius - 160) < 1));
  assert.equal(coast.metrics.turns, 0);
  assert.notEqual(run(scene, { ...scene.reference, burnAt: 1 }).status, "success");
});

test("bounded integration and finite telemetry across 210 varied plans", () => {
  for (let stage = 1; stage <= 6; stage++) {
    const scene = makeSector(stage, "sweep");
    for (const angle of [-180, -120, -60, 0, 60, 120, 180]) for (const power of [20, 80, 140, 220, 320]) {
      const result = simulate(scene, angle, power, { burn: -50, burnAt: 1.1 });
      assert.ok(result.time <= DT * MAX_STEPS);
      assert.ok(result.path.length <= MAX_STEPS / 2 + 2);
      assert.ok(["success", "lost", "collision", "timeout"].includes(result.status));
      for (const p of result.path) {
        for (const key of ["x", "y", "vx", "vy", "t"]) assert.ok(Number.isFinite(p[key]));
        for (const v of Object.values(p.metrics)) if (typeof v === "number") assert.ok(Number.isFinite(v));
      }
    }
  }
});

test("scene, seed, launch and maneuver input boundaries reject malformed values", () => {
  for (const stage of [0, 7, 1.5, NaN]) assert.throws(() => makeSector(stage, "ok"));
  for (const seed of ["", " ", "한글", "a".repeat(41), null]) assert.throws(() => makeSector(1, seed));
  const s = makeSector(1, "bounds");
  for (const [a, v] of [[181, 100], [-181, 100], [0, 19], [0, 321], [NaN, 100], [0, Infinity]]) assert.throws(() => simulate(s, a, v));
  for (const option of [{ burn: 81 }, { burn: NaN }, { burnAt: -1 }, { burnAt: 21 }, { burnAt: Infinity }]) assert.throws(() => simulate(s, 0, 100, option));
  const bad = structuredClone(s); bad.bodies[0].mass = Infinity;
  assert.throws(() => simulate(bad, 0, 100));
  bad.bodies = []; assert.throws(() => simulate(bad, 0, 100));
});

test("success-only scoring applies attempts, hints and actual burn cost", () => {
  const s = makeSector(1, "score"), r = run(s);
  assert.equal(flightScore({ status: "lost" }, 100, 1), 0);
  assert.equal(flightScore(r, 100, 1) - flightScore(r, 100, 2), 45);
  assert.equal(flightScore(r, 100, 1) - flightScore(r, 100, 1, true), 120);
  assert.equal(flightScore(r, 100, 1) - flightScore({ ...r, fuel: r.fuel + 10 }, 100, 1), 20);
});
