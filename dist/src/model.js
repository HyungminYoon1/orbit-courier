import { rng } from "./core.js";

// Dimensionless educational model: fixed sources, inverse-square acceleration.
export const DT = 1 / 120;
export const MAX_STEPS = 4800;
export const SAMPLE_DT = DT * 2;
export const SHIP_RADIUS = 5;
export const TITLES = ["행성 주위를 한 바퀴 돌기", "행성에서 멀리 벗어나기", "정거장에 천천히 도착하기", "이웃 행성이 있어도 궤도 유지하기", "행성 곁을 지나 정거장에 도착하기", "더 큰 궤도로 옮겨가기"];
export const LIMITS = { angle: [-180, 180], power: [20, 320], burn: [-80, 80], burnAt: [0, 20] };
const TAU = Math.PI * 2;
const finite = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const body = (x, y, mass, radius, name, color = "#b88458") => ({ x, y, mass, radius, name, color });

export function makeSector(stage, seed) {
  if (!Number.isInteger(stage) || stage < 1 || stage > TITLES.length ||
      typeof seed !== "string" || !/^[A-Za-z0-9-]{1,40}$/.test(seed)) throw new TypeError("Invalid sector");
  const scene = {
    stage, title: TITLES[stage - 1], start: { x: 570, y: 280 },
    bodies: [body(450, 280, 1200000, 40, "아틀라스")],
    mission: { type: "orbit", radius: 120, tolerance: 0.06, maxEccentricity: 0.08, turns: 1 },
    defaults: { angle: -75, power: 85, burn: 0, burnAt: 4 },
    reference: { angle: -90, power: 100, burn: 0, burnAt: 4 },
    lesson: "탐사선이 아틀라스 주위를 원에 가깝게 한 바퀴 돌도록 발사 방향과 속도를 맞추세요.",
    hint: "행성 쪽이 아니라 파란 목표 원을 따라 날아가도록 방향을 맞추세요. 이 궤도의 기준 속도는 100입니다.",
  };
  if (stage === 2) {
    scene.start.x = 550;
    scene.mission = { type: "escape", radius: 240 };
    scene.defaults = { angle: -90, power: 130, burn: 0, burnAt: 2 };
    scene.reference = { angle: -90, power: 170, burn: 0, burnAt: 2 };
    scene.lesson = "탐사선이 행성으로 되돌아오지 않고 멀어지도록 발사하세요. 파란 점선으로 표시된 탈출 경계 밖으로 나가야 합니다.";
    scene.hint = "초기 속도를 높여 보세요. 출발점의 탈출 속도는 약 155이며, 170으로 발사하면 경계 밖으로 나갈 수 있습니다.";
  }
  if (stage === 3 || stage === 5) {
    scene.start = { x: 110, y: 420 };
    scene.bodies = [body(450, 310, 700000, 40, "아틀라스"), body(690, 440, 160000, 26, "네리", "#62bfd2")];
    scene.target = { x: 780, y: 160, radius: 27, maxSpeed: 120 };
    scene.mission = { type: "delivery" };
    scene.defaults = { angle: -30, power: 220, burn: 0, burnAt: 2 };
    scene.reference = { angle: -47, power: 100, burn: 0, burnAt: 2 };
    scene.lesson = "행성을 피해서 초록색 정거장 구역에 도착하세요. 진입 속도가 120을 넘으면 성공으로 인정되지 않습니다.";
    scene.hint = "초기 속도를 낮추거나 속도 변화 Δv를 음수로 설정해 감속하세요. 예상 궤적과 실제 도착 속도를 함께 확인하세요.";
    if (stage === 5) {
      scene.bodies.push(body(220, 100, 100000, 22, "이오", "#a78be3"));
      scene.mission = { type: "flyby", body: 0, near: 120, exit: 140, minTurn: 20 };
      scene.target = { x: 780, y: 210, radius: 30, maxSpeed: 250 };
      scene.reference = { angle: -42, power: 100, burn: 0, burnAt: 2 };
      scene.lesson = "아틀라스 가까이를 지나며 중력으로 방향을 바꾼 뒤, 초록색 정거장 구역에 도착하세요. 행성 근처를 지나는 동안에는 엔진을 분사하면 안 됩니다.";
      scene.hint = "노란 실선 안쪽까지 접근한 뒤 점선 밖으로 나오세요. 점선 안에서는 분사하지 않고 방향을 20° 이상 바꿔야 하며, 그 다음 정거장에 도착해야 합니다.";
    }
  }
  if (stage === 4) {
    scene.bodies[0].x = 410;
    scene.start.x = 530;
    scene.bodies.push(body(750, 280, 24000, 25, "네리", "#62bfd2"));
    scene.lesson = "이웃 행성 네리의 중력도 탐사선을 끌어당깁니다. 그 영향을 받으면서도 아틀라스 주위를 원에 가깝게 한 바퀴 도세요.";
    scene.hint = "기준 속도 100에서 시작해 각도와 속도를 조금씩 조절하세요. 실제 궤적이 파란 목표 원에서 얼마나 벗어나는지 확인하세요.";
  }
  if (stage === 6) {
    scene.start.x = 540;
    scene.mission.radius = 160;
    const a = (90 + 160) / 2;
    const transferSpeed = Math.sqrt(1200000 * (2 / 90 - 1 / a));
    const arrivalSpeed = Math.sqrt(1200000 * (2 / 160 - 1 / a));
    scene.reference = { angle: -90, power: transferSpeed, burn: Math.sqrt(1200000 / 160) - arrivalSpeed, burnAt: Math.PI * Math.sqrt(a ** 3 / 1200000) };
    scene.defaults = { angle: -90, power: 130.5, burn: 0, burnAt: 4 };
    scene.lesson = "행성 가까이에서 출발해 더 바깥쪽의 파란 목표 궤도로 옮겨가세요. 도착한 뒤에는 그 궤도를 한 바퀴 유지해야 합니다.";
    scene.hint = "초기 속도 약 130.5로 출발하고 T+4.00에 속도를 13.0만큼 높여 보세요. 탐사선이 행성에서 가장 멀어진 지점에서 분사하는 것이 핵심입니다.";
  }
  // Variants reflect/translate authored geometry; targets never follow a sampled shot.
  const random = rng(seed + "|orbit-v2");
  const mirror = random() < 0.5;
  const shift = [-12, 0, 12][Math.floor(random() * 3)];
  for (const point of [scene.start, ...scene.bodies, ...(scene.target ? [scene.target] : [])]) {
    point.x += shift;
    if (mirror) point.y = 560 - point.y;
  }
  if (mirror) for (const plan of [scene.defaults, scene.reference]) plan.angle *= -1;
  scene.variant = mirror ? "상하 반전" : "기본 방향";
  return scene;
}

function validateScene(scene) {
  const point = (p) => p && finite(p.x, -1000, 2000) && finite(p.y, -1000, 2000);
  if (!scene || !point(scene.start) || !Array.isArray(scene.bodies) || !scene.bodies.length || scene.bodies.length > 3 ||
      scene.bodies.some((b) => !point(b) || !finite(b.mass, 1, 5000000) || !finite(b.radius, 1, 100))) throw new TypeError("Invalid scene");
  const m = scene.mission;
  if (!m || !["orbit", "escape", "delivery", "flyby"].includes(m.type)) throw new TypeError("Invalid mission");
  if (m.type === "orbit" && (!finite(m.radius, 20, 250) || !finite(m.tolerance, 0.01, 0.3) || !finite(m.maxEccentricity, 0.01, 0.5) || !finite(m.turns, 1, 3))) throw new TypeError("Invalid orbit");
  if (m.type === "escape" && !finite(m.radius, 100, 300)) throw new TypeError("Invalid escape");
  if (["delivery", "flyby"].includes(m.type) && (!point(scene.target) || !finite(scene.target.radius, 5, 60) || !finite(scene.target.maxSpeed, 1, 500))) throw new TypeError("Invalid target");
  if (m.type === "flyby" && (!Number.isInteger(m.body) || !scene.bodies[m.body] || !finite(m.near, 30, 200) || !finite(m.exit, m.near + 1, 250) || !finite(m.minTurn, 1, 180))) throw new TypeError("Invalid flyby");
}

export function acceleration(scene, p) {
  let x = 0, y = 0;
  for (const b of scene.bodies) {
    const dx = b.x - p.x, dy = b.y - p.y;
    const r = Math.hypot(dx, dy);
    if (r === 0) throw new RangeError("Gravity singularity");
    const factor = b.mass / r ** 3;
    x += dx * factor;
    y += dy * factor;
  }
  return { x, y };
}

export function orbitalMetrics(scene, p) {
  const primary = scene.bodies[0];
  const dx = p.x - primary.x, dy = p.y - primary.y;
  const radius = Math.hypot(dx, dy), speed = Math.hypot(p.vx, p.vy);
  const primaryEnergy = speed ** 2 / 2 - primary.mass / radius;
  const h = dx * p.vy - dy * p.vx;
  return {
    radius, speed, radialSpeed: (dx * p.vx + dy * p.vy) / radius,
    energy: speed ** 2 / 2 - scene.bodies.reduce((sum, b) => sum + b.mass / Math.hypot(p.x - b.x, p.y - b.y), 0),
    eccentricity: Math.sqrt(Math.max(0, 1 + 2 * primaryEnergy * h ** 2 / primary.mass ** 2)),
    circularSpeed: Math.sqrt(primary.mass / radius),
  };
}

// Earliest contact of the ship centre with an expanded circle during one step.
export function segmentHit(a, b, circle, radius = circle.radius) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - circle.x, fy = a.y - circle.y;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy;
  if (!aa) return null;
  const bb = 2 * (fx * dx + fy * dy), discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

export function simulate(scene, angle, power, options = {}) {
  validateScene(scene);
  const burn = options.burn ?? 0, burnAt = options.burnAt ?? 4;
  if (!finite(angle, ...LIMITS.angle) || !finite(power, ...LIMITS.power) || !finite(burn, ...LIMITS.burn) || !finite(burnAt, ...LIMITS.burnAt)) throw new TypeError("Invalid launch");
  const rad = angle * Math.PI / 180;
  let p = { ...scene.start, vx: Math.cos(rad) * power, vy: Math.sin(rad) * power, t: 0 };
  const path = [], events = [];
  let status = "timeout", reason = "제한 시간 40 안에 임무를 완료하지 못했습니다.";
  let orbitAngle = 0, orbitActive = false, flybyEntry = null, near = false, flyby = false, turn = 0;
  let minRadius = Math.hypot(p.x - scene.bodies[0].x, p.y - scene.bodies[0].y);
  let closestTarget = scene.target ? Math.hypot(p.x - scene.target.x, p.y - scene.target.y) : null;
  let burnDone = false, burnEnergy = 0, maxEnergyError = 0, passageBurn = false;
  const collisionAtStart = scene.bodies.some((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.radius + SHIP_RADIUS);
  if (collisionAtStart) return { status: "collision", reason: "시작점이 행성과 겹칩니다.", path: [p], time: 0, events, metrics: null, fuel: 0 };
  const initialEnergy = orbitalMetrics(scene, p).energy;
  const m = scene.mission;
  const sample = () => ({ ...p, metrics: { ...orbitalMetrics(scene, p), conservedEnergy: initialEnergy + burnEnergy, turns: Math.abs(orbitAngle) / TAU, orbitActive, flyby, turn, near, closestTarget, minRadius, burnDone, maxEnergyError } });
  path.push(sample());
  for (let step = 1; step <= MAX_STEPS; step++) {
    if (!burnDone && burn !== 0 && step - 1 >= Math.round(burnAt / DT)) {
      const speed = Math.hypot(p.vx, p.vy);
      const applied = Math.max(-speed, burn);
      if (speed > 1e-10) {
        p.vx *= (speed + applied) / speed;
        p.vy *= (speed + applied) / speed;
        burnEnergy += ((speed + applied) ** 2 - speed ** 2) / 2;
      }
      burnDone = true;
      if (m.type === "flyby" && Math.hypot(p.x - scene.bodies[m.body].x, p.y - scene.bodies[m.body].y) <= m.exit) passageBurn = true;
      events.push({ type: "burn", x: p.x, y: p.y, t: p.t, deltaV: speed > 1e-10 ? applied : 0 });
    }
    const a = acceleration(scene, p);
    const next = { x: p.x + p.vx * DT + a.x * DT ** 2 / 2, y: p.y + p.vy * DT + a.y * DT ** 2 / 2, vx: p.vx, vy: p.vy, t: step * DT };
    const hits = scene.bodies.map((b) => segmentHit(p, next, b, b.radius + SHIP_RADIUS)).filter((t) => t !== null);
    if (hits.length) {
      const fraction = Math.min(...hits);
      p = { ...p, x: p.x + (next.x - p.x) * fraction, y: p.y + (next.y - p.y) * fraction, t: p.t + DT * fraction };
      status = "collision"; reason = "행성과 충돌했습니다.";
      path.push(sample()); break;
    }
    const aa = acceleration(scene, next);
    next.vx += (a.x + aa.x) * DT / 2;
    next.vy += (a.y + aa.y) * DT / 2;
    const previous = p;
    p = next;
    const metrics = orbitalMetrics(scene, p);
    minRadius = Math.min(minRadius, metrics.radius);
    maxEnergyError = Math.max(maxEnergyError, Math.abs(metrics.energy - initialEnergy - burnEnergy) / Math.max(1, Math.abs(initialEnergy)));
    if (m.type === "orbit") {
      const valid = Math.abs(metrics.radius - m.radius) <= m.radius * m.tolerance && metrics.eccentricity <= m.maxEccentricity && metrics.energy < 0;
      if (valid) {
        const b = scene.bodies[0];
        const delta = Math.atan2(p.y - b.y, p.x - b.x) - Math.atan2(previous.y - b.y, previous.x - b.x);
        if (orbitActive) orbitAngle += Math.atan2(Math.sin(delta), Math.cos(delta));
        orbitActive = true;
        if (Math.abs(orbitAngle) >= TAU * m.turns) { status = "success"; reason = "원에 가까운 궤도를 유지하며 한 바퀴 돌았습니다."; }
      } else { orbitAngle = 0; orbitActive = false; }
    }
    if (m.type === "escape" && metrics.radius >= m.radius && initialEnergy + burnEnergy > 1e-6 && metrics.radialSpeed > 0) {
      status = "success"; reason = "행성에서 멀어지며 탈출 경계를 통과했습니다.";
    }
    if (m.type === "flyby" && !flyby) {
      const b = scene.bodies[m.body], distance = Math.hypot(p.x - b.x, p.y - b.y);
      if (!flybyEntry && distance <= m.exit) flybyEntry = { vx: p.vx, vy: p.vy };
      if (flybyEntry && distance <= m.near) near = true;
      if (flybyEntry && distance > m.exit) {
        const dot = flybyEntry.vx * p.vx + flybyEntry.vy * p.vy;
        turn = Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(flybyEntry.vx, flybyEntry.vy) * metrics.speed)))) * 180 / Math.PI;
        flyby = near && turn >= m.minTurn && !passageBurn;
        if (flyby) events.push({ type: "flyby", x: p.x, y: p.y, t: p.t });
        else { flybyEntry = null; near = false; passageBurn = false; }
      }
    }
    if (scene.target) {
      closestTarget = Math.min(closestTarget, Math.hypot(p.x - scene.target.x, p.y - scene.target.y));
      if (segmentHit(previous, p, scene.target) !== null) {
        if (step === 1 || Math.hypot(previous.x - scene.target.x, previous.y - scene.target.y) > scene.target.radius) {
          const contact = segmentHit(previous, p, scene.target);
          events.push({ type: "arrival", t: previous.t + contact * DT,
            speed: Math.max(metrics.speed, Math.hypot(previous.vx, previous.vy)), flyby });
        }
        if (Math.max(metrics.speed, Math.hypot(previous.vx, previous.vy)) <= scene.target.maxSpeed && (m.type !== "flyby" || flyby)) {
          status = "success"; reason = "제한 속도를 지키며 정거장에 도착했습니다.";
        } else if (Math.max(metrics.speed, Math.hypot(previous.vx, previous.vy)) > scene.target.maxSpeed) reason = "정거장에 도착할 때의 속도가 제한을 넘었습니다.";
        else reason = "분사 없이 행성 곁을 지나 방향을 바꾸는 조건을 아직 충족하지 못했습니다.";
      }
    }
    if (status !== "success" && (p.x < -30 || p.x > 930 || p.y < -30 || p.y > 590)) {
      status = "lost";
      if (reason.startsWith("제한 시간 40")) reason = "비행 화면 밖으로 벗어났습니다.";
    }
    if (step % 2 === 0 || status !== "timeout") path.push(sample());
    if (status !== "timeout") break;
  }
  return { status, reason, path, time: p.t, events, metrics: path.at(-1).metrics, fuel: power + events.filter((e) => e.type === "burn").reduce((sum, e) => sum + Math.abs(e.deltaV), 0) };
}

export function flightScore(result, power, attempts, hinted = false) {
  if (result.status !== "success") return 0;
  return Math.max(50, Math.round(1500 - (result.fuel ?? power) * 2 - result.time * 6 - Math.max(0, attempts - 1) * 45 - (hinted ? 120 : 0)));
}
