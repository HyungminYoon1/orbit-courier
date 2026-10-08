import {
  $,
  freshSeed,
  cleanSeed,
  loadLocal,
  saveLocal,
  announce,
  rng,
  tool,
} from "./core.js";
import { makeSector, simulate, flightScore, TITLES } from "./model.js";
const KEY = "orbit-courier-v1";
let stored = loadLocal(KEY, { best: {}, unlocked: 1 }),
  record = {
    best: stored && typeof stored.best === "object" ? stored.best : {},
    unlocked: Math.max(1, Math.min(10, Number(stored?.unlocked) || 1)),
  };
let seed = freshSeed(),
  stage = 1,
  scene,
  phase = "aim",
  attempts = 0,
  hinted = false,
  trails = [],
  flight = null,
  cursor = 0,
  frame = 0,
  last = 0,
  dragging = false;
const canvas = $("space"),
  ctx = canvas.getContext("2d");
let stars = [];
function save() {
  if (!saveLocal(KEY, record))
    announce("이 브라우저에 기록을 저장할 수 없습니다.");
}
function angle() {
  return Number($("angle").value);
}
function power() {
  return Number($("power").value);
}
function controls() {
  $("angle-output").value = angle() + "°";
  $("power-output").value = String(power());
  $("angle").disabled = ["flying", "paused"].includes(phase);
  $("power").disabled = ["flying", "paused"].includes(phase);
  $("launch").disabled = ["success", "failure"].includes(phase);
  $("launch").textContent =
    phase === "flying"
      ? "일시정지"
      : phase === "paused"
        ? "비행 계속"
        : "배송 시작";
}
function sector() {
  cancelAnimationFrame(frame);
  phase = "aim";
  attempts = 0;
  hinted = false;
  trails = [];
  flight = null;
  cursor = 0;
  scene = makeSector(stage, seed);
  const r = rng(seed + "stars");
  stars = Array.from({ length: 130 }, () => ({
    x: r() * 900,
    y: r() * 560,
    size: r() * 1.4 + 0.4,
  }));
  $("sector").textContent =
    "SECTOR " + String(stage).padStart(2, "0") + " / 10";
  $("mission-title").textContent = scene.title;
  $("mission-copy").textContent =
    stage < 4
      ? "발사 방향과 세기를 정해 정거장에 도착하세요."
      : stage < 8
        ? "여러 중력원 사이에서 안전한 항로를 찾아보세요."
        : "작은 목적지까지 궤적을 정밀하게 조절하세요.";
  $("stage").replaceChildren(
    ...TITLES.map((t, i) =>
      Object.assign(document.createElement("option"), {
        value: String(i + 1),
        textContent: String(i + 1).padStart(2, "0") + " · " + t,
        disabled: i + 1 > record.unlocked,
      }),
    ),
  );
  $("stage").value = String(stage);
  $("seed").value = seed;
  $("attempts").textContent = "00";
  $("best").textContent = record.best[seed + "-" + stage] || "—";
  $("outcome").hidden = true;
  $("next").hidden = true;
  $("flight-state").textContent = "발사 준비";
  $("telemetry").textContent = "T+0.00 s";
  $("status").textContent = "캔버스에서 드래그하거나 각도·추진력을 조절하세요.";
  controls();
  draw();
}
function line(path, color, dashed = false) {
  if (path.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 1.5 : 2.5;
  ctx.setLineDash(dashed ? [3, 7] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
function draw() {
  ctx.clearRect(0, 0, 900, 560);
  ctx.fillStyle = "#050e17";
  ctx.fillRect(0, 0, 900, 560);
  for (const s of stars) {
    ctx.fillStyle = "#96b2bf";
    ctx.globalAlpha = 0.45;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#17313f";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 900; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 560);
    ctx.stroke();
  }
  for (let y = 0; y <= 560; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(900, y);
    ctx.stroke();
  }
  for (const b of scene.bodies) {
    ctx.strokeStyle = "#29424c";
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const gradient = ctx.createRadialGradient(
      b.x - b.radius * 0.4,
      b.y - b.radius * 0.4,
      2,
      b.x,
      b.y,
      b.radius,
    );
    gradient.addColorStop(0, b.color);
    gradient.addColorStop(1, "#1f2b30");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.stroke();
  }
  const target = scene.target;
  ctx.strokeStyle = "#c4fb5c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#c4fb5c";
  ctx.font = "13px Consolas";
  ctx.fillText("DROP-OFF", target.x - 28, target.y - target.radius - 16);
  for (const trail of trails) line(trail, "#43616e", true);
  if (flight) line(flight.path.slice(0, Math.floor(cursor) + 1), "#c4fb5c");
  if (phase === "aim") {
    const rad = (angle() * Math.PI) / 180,
      length = power() * 0.4;
    const to = {
      x: scene.start.x + Math.cos(rad) * length,
      y: scene.start.y + Math.sin(rad) * length,
    };
    line([scene.start, to], "#c4fb5c");
    ctx.beginPath();
    ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#c4fb5c";
    ctx.fill();
  }
  const point = flight
    ? flight.path[Math.min(Math.floor(cursor), flight.path.length - 1)]
    : scene.start;
  ctx.save();
  ctx.translate(point.x, point.y);
  let heading = (angle() * Math.PI) / 180;
  if (flight && cursor > 1) {
    const prev = flight.path[Math.max(0, Math.floor(cursor) - 1)];
    heading = Math.atan2(point.y - prev.y, point.x - prev.x);
  }
  ctx.rotate(heading);
  ctx.fillStyle = "#edf2ec";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function end() {
  phase = flight.status === "success" ? "success" : "failure";
  $("flight-state").textContent =
    phase === "success" ? "배송 완료" : "항로 재설정";
  const score = flightScore(flight, power(), attempts, hinted);
  $("outcome").replaceChildren();
  const h = document.createElement("h2"),
    p = document.createElement("p");
  h.textContent =
    phase === "success"
      ? "DELIVERED / " + score + " PT"
      : flight.status === "collision"
        ? "행성과 충돌했습니다."
        : "정거장에 도착하지 못했습니다.";
  p.textContent =
    phase === "success"
      ? "추진력 " +
        power() +
        " · 비행 " +
        flight.time.toFixed(2) +
        " s · 시도 " +
        attempts +
        "회"
      : "궤적을 참고해 각도와 세기를 조금씩 바꿔보세요.";
  $("outcome").append(h, p);
  $("outcome").hidden = false;
  if (phase === "success") {
    const key = seed + "-" + stage;
    record.best[key] = Math.max(Number(record.best[key]) || 0, score);
    const keys = Object.keys(record.best);
    if (keys.length > 100) delete record.best[keys[0]];
    record.unlocked = Math.max(record.unlocked, Math.min(10, stage + 1));
    save();
    $("best").textContent = record.best[key];
    $("next").hidden = stage === 10;
    $("status").textContent =
      stage === 10
        ? "10개 구간을 모두 배송했습니다. 새 항로에도 도전해보세요."
        : "성공했습니다. 더 적은 추진력으로 최고 기록을 노려보세요.";
  } else $("status").textContent = "실패 궤적을 남겼습니다. 다시 조준해보세요.";
  controls();
  draw();
}
function animate(now) {
  if (phase !== "flying") return;
  const delta = last ? Math.min(0.08, (now - last) / 1000) : 0;
  last = now;
  cursor = Math.min(flight.path.length - 1, cursor + delta * 120);
  $("telemetry").textContent =
    "T+" + flight.path[Math.floor(cursor)].t.toFixed(2) + " s";
  draw();
  if (cursor >= flight.path.length - 1) end();
  else frame = requestAnimationFrame(animate);
}
function launch() {
  if (phase === "flying") {
    phase = "paused";
    cancelAnimationFrame(frame);
    $("flight-state").textContent = "일시정지";
    controls();
    return;
  }
  if (phase === "paused") {
    phase = "flying";
    last = 0;
    $("flight-state").textContent = "배송 중";
    controls();
    frame = requestAnimationFrame(animate);
    return;
  }
  if (phase !== "aim") return;
  attempts++;
  $("attempts").textContent = String(attempts).padStart(2, "0");
  flight = simulate(scene, angle(), power());
  cursor = 0;
  phase = "flying";
  last = 0;
  $("outcome").hidden = true;
  $("flight-state").textContent = "배송 중";
  controls();
  frame = requestAnimationFrame(animate);
}
function retry() {
  cancelAnimationFrame(frame);
  if (flight) trails.push(flight.path.slice(0, Math.floor(cursor) + 1));
  trails = trails.slice(-3);
  phase = "aim";
  flight = null;
  cursor = 0;
  $("outcome").hidden = true;
  $("next").hidden = true;
  $("flight-state").textContent = "발사 준비";
  $("telemetry").textContent = "T+0.00 s";
  controls();
  draw();
}
$("angle").oninput = $("power").oninput = () => {
  controls();
  draw();
};
$("launch").onclick = launch;
$("retry").onclick = retry;
$("hint").onclick = () => {
  if (phase !== "aim") return;
  hinted = true;
  $("status").textContent =
    "가능한 항로 중 하나는 각도 " +
    scene.witness.angle +
    "° 근처, 추진력 " +
    scene.witness.power +
    " 근처입니다. 힌트 사용 시 성공 점수 −120.";
};
$("next").onclick = () => {
  if (phase === "success" && stage < 10) {
    stage++;
    sector();
  }
};
$("stage").onchange = () => {
  stage = Number($("stage").value);
  sector();
};
$("apply-seed").onclick = () => {
  try {
    const next = cleanSeed($("seed").value);
    seed = next;
    stage = 1;
    sector();
  } catch (e) {
    announce(e.message);
  }
};
$("new-route").onclick = () => {
  seed = freshSeed();
  stage = 1;
  sector();
};
$("clear").onclick = () => {
  if (confirm("이 브라우저의 배송 최고 기록과 구간 진행을 삭제할까요?")) {
    record = { best: {}, unlocked: 1 };
    save();
    stage = 1;
    sector();
  }
};
function aimAt(e) {
  const box = canvas.getBoundingClientRect(),
    x = ((e.clientX - box.left) * 900) / box.width,
    y = ((e.clientY - box.top) * 560) / box.height,
    dx = x - scene.start.x,
    dy = y - scene.start.y;
  $("angle").value = String(
    Math.max(
      -80,
      Math.min(25, Math.round((Math.atan2(dy, dx) * 180) / Math.PI)),
    ),
  );
  $("power").value = String(
    Math.max(140, Math.min(420, Math.round(Math.hypot(dx, dy) / 0.4 / 5) * 5)),
  );
  controls();
  draw();
}
canvas.onpointerdown = (e) => {
  if (phase !== "aim" || !e.isPrimary || e.button !== 0) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  aimAt(e);
};
canvas.onpointermove = (e) => {
  if (dragging) aimAt(e);
};
canvas.onpointerup = canvas.onpointercancel = () => (dragging = false);
canvas.onkeydown = (e) => {
  if (e.key === " ") {
    e.preventDefault();
    launch();
  } else if (
    phase === "aim" &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    if (e.key === "ArrowLeft") $("angle").value = String(angle() - 1);
    if (e.key === "ArrowRight") $("angle").value = String(angle() + 1);
    if (e.key === "ArrowUp") $("power").value = String(power() + 5);
    if (e.key === "ArrowDown") $("power").value = String(power() - 5);
    controls();
    draw();
  }
};
const pause = () => {
  if (phase === "flying") launch();
};
addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
addEventListener("pagehide", () => cancelAnimationFrame(frame));
tool(
  "configure_flight",
  "항로와 발사 설정",
  {
    type: "object",
    properties: {
      stage: { type: "integer", minimum: 1, maximum: 10 },
      seed: { type: "string", maxLength: 40 },
      angle: { type: "number", minimum: -80, maximum: 25 },
      power: { type: "number", minimum: 140, maximum: 420 },
    },
    required: ["stage", "seed", "angle", "power"],
    additionalProperties: false,
  },
  (input) => {
    if (
      !input ||
      !Number.isInteger(input.stage) ||
      input.stage < 1 ||
      input.stage > record.unlocked ||
      !Number.isFinite(input.angle) ||
      input.angle < -80 ||
      input.angle > 25 ||
      !Number.isFinite(input.power) ||
      input.power < 140 ||
      input.power > 420
    )
      throw Error("Invalid flight configuration");
    const s = cleanSeed(input.seed);
    seed = s;
    stage = input.stage;
    sector();
    $("angle").value = String(input.angle);
    $("power").value = String(input.power);
    controls();
    draw();
    return { stage, seed, angle: angle(), power: power(), state: phase };
  },
);
sector();
