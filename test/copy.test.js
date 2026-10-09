import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeSector, simulate, TITLES } from "../dist/src/model.js";
import { flightFeedback } from "../dist/src/feedback.js";

const jargon = /배송|섭동|플라이바이|총 비에너지|무분사/;

test("all six mission briefings describe the player's action in Korean", () => {
  assert.deepEqual(TITLES, [
    "행성 주위를 한 바퀴 돌기",
    "행성에서 멀리 벗어나기",
    "정거장에 천천히 도착하기",
    "이웃 행성이 있어도 궤도 유지하기",
    "행성 곁을 지나 정거장에 도착하기",
    "더 큰 궤도로 옮겨가기",
  ]);
  for (let stage = 1; stage <= 6; stage++) {
    const scene = makeSector(stage, "copy");
    for (const text of [scene.title, scene.lesson, scene.hint]) {
      assert.doesNotMatch(text, jargon);
      assert.ok(text.length > 0);
    }
  }
});

test("successful flight feedback uses arrival language without changing the target distance", () => {
  for (let stage = 1; stage <= 6; stage++) {
    const scene = makeSector(stage, "copy");
    const result = simulate(scene, scene.reference.angle, scene.reference.power, scene.reference);
    const feedback = flightFeedback(scene, result);
    assert.equal(result.status, "success");
    assert.doesNotMatch(feedback.diagnosis + feedback.label + feedback.condition, jargon);
    assert.match(feedback.label, /거리/);
    assert.equal(feedback.target, scene.target?.radius ?? scene.mission.radius);
    if (scene.target) assert.match(feedback.diagnosis, /정거장에 도착/);
  }
});

test("public shell and UI copy replace shipping jargon and explain symbols", async () => {
  const shell = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../dist/src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(shell + app, jargon);
  assert.ok(shell.includes("T+는 비행 시작 후 지난 시간"));
  assert.ok(shell.includes("Δv는 엔진 분사로 바뀌는 속도"));
  assert.ok(shell.includes("e(이심률)는 0이면 원형"));
  assert.ok(shell.includes(TITLES[0]));
});
