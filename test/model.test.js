import test from "node:test";
import assert from "node:assert/strict";
import { makeSector, simulate, flightScore } from "../dist/src/model.js";
test("100 generated routes have a successful witness", () => {
  for (let stage = 1; stage <= 10; stage++)
    for (let i = 0; i < 10; i++) {
      const scene = makeSector(stage, "test-" + i);
      assert.deepEqual(scene, makeSector(stage, "test-" + i));
      const result = simulate(scene, scene.witness.angle, scene.witness.power);
      assert.equal(result.status, "success");
      assert.ok(
        result.path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
      assert.ok(flightScore(result, scene.witness.power, 1) > 0);
    }
});
test("launch bounds and failed score", () => {
  const scene = makeSector(1, "bounds");
  assert.throws(() => simulate(scene, 99, 260));
  assert.throws(() => simulate(scene, -20, NaN));
  assert.throws(() => makeSector(0, "x"));
  assert.equal(flightScore({ status: "lost" }, 200, 1), 0);
});
test("attempt and hint penalties applied", () => {
  const scene = makeSector(3, "penalty"),
    r = simulate(scene, scene.witness.angle, scene.witness.power);
  assert.ok(
    flightScore(r, scene.witness.power, 1) >
      flightScore(r, scene.witness.power, 2),
  );
  assert.ok(
    flightScore(r, scene.witness.power, 1) >
      flightScore(r, scene.witness.power, 1, true),
  );
});
