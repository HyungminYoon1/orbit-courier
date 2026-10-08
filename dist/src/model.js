import { rng } from "./core.js";
export const DT = 1 / 60;
export const TITLES = [
  "첫 번째 배송",
  "중력 옆으로",
  "낮은 궤도의 곡선",
  "두 개의 이웃",
  "좁은 항로",
  "행성 사이로",
  "멀리 있는 정거장",
  "세 개의 중력원",
  "정밀 착륙",
  "마지막 특급 배송",
];
export function simulate(scene, angle, power) {
  if (
    !Number.isFinite(angle) ||
    angle < -80 ||
    angle > 25 ||
    !Number.isFinite(power) ||
    power < 140 ||
    power > 420
  )
    throw new TypeError("Invalid launch");
  const rad = (angle * Math.PI) / 180;
  let x = scene.start.x,
    y = scene.start.y,
    vx = Math.cos(rad) * power,
    vy = Math.sin(rad) * power;
  const path = [{ x, y, t: 0 }];
  let status = "timeout";
  for (let step = 1; step <= 960; step++) {
    let ax = 0,
      ay = 0;
    for (const b of scene.bodies) {
      const dx = b.x - x,
        dy = b.y - y,
        d2 = dx * dx + dy * dy + 1800,
        force = b.mass / (d2 * Math.sqrt(d2));
      ax += dx * force;
      ay += dy * force;
    }
    vx += ax * DT;
    vy += ay * DT;
    x += vx * DT;
    y += vy * DT;
    path.push({ x, y, t: step * DT });
    if (
      scene.bodies.some((b) => Math.hypot(x - b.x, y - b.y) <= b.radius + 5)
    ) {
      status = "collision";
      break;
    }
    if (
      Math.hypot(x - scene.target.x, y - scene.target.y) <= scene.target.radius
    ) {
      status = "success";
      break;
    }
    if (x < -30 || x > 930 || y < -30 || y > 590) {
      status = "lost";
      break;
    }
  }
  return { status, path, time: path.at(-1).t };
}
export function makeSector(stage, seed) {
  if (
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > 10 ||
    typeof seed !== "string" ||
    seed.length > 40
  )
    throw new TypeError("Invalid sector");
  const r = rng(seed + "|orbit-v1|" + stage),
    scene = {
      stage,
      title: TITLES[stage - 1],
      start: { x: 100, y: 420 },
      target: { x: -999, y: -999, radius: Math.max(17, 30 - stage) },
      bodies: [
        {
          x: 420 + r() * 100,
          y: 255 + r() * 90,
          radius: 48 + r() * 12,
          mass: 1050000 + r() * 250000,
          color: "#b88458",
        },
      ],
    };
  if (stage >= 4)
    scene.bodies.push({
      x: 630 + r() * 70,
      y: 425 + r() * 45,
      radius: 28,
      mass: 350000,
      color: "#588ea8",
    });
  if (stage >= 8)
    scene.bodies.push({
      x: 620 + r() * 60,
      y: 90 + r() * 35,
      radius: 24,
      mass: 240000,
      color: "#869365",
    });
  const candidates = [];
  for (const angle of [-40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10])
    for (const power of [200, 220, 240, 260, 280, 300, 320, 340, 360]) {
      const result = simulate(scene, angle, power);
      const eligible = result.path.filter(
        (p) =>
          p.x > 620 &&
          p.x < 825 &&
          p.y > 75 &&
          p.y < 480 &&
          !scene.bodies.some(
            (b) => Math.hypot(p.x - b.x, p.y - b.y) < b.radius + 45,
          ),
      );
      if (eligible.length)
        candidates.push({
          angle,
          power,
          point: eligible[Math.floor(eligible.length * 0.6)],
        });
    }
  if (!candidates.length) throw Error("Could not generate reachable route");
  const w = candidates[Math.floor(r() * candidates.length)];
  scene.target = {
    x: w.point.x,
    y: w.point.y,
    radius: Math.max(17, 30 - stage),
  };
  scene.witness = { angle: w.angle, power: w.power };
  return scene;
}
export function flightScore(result, power, attempts, hinted = false) {
  if (result.status !== "success") return 0;
  return Math.max(
    50,
    Math.round(
      1000 -
        (power - 140) * 1.2 -
        result.time * 12 -
        Math.max(0, attempts - 1) * 45 -
        (hinted ? 120 : 0),
    ),
  );
}
