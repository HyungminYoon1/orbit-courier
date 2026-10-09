import { $, freshSeed, cleanSeed, loadLocal, saveLocal, announce, rng, tool } from "./core.js";
import { makeSector, simulate, flightScore, TITLES, LIMITS } from "./model.js";
import { normalizeRecord, rememberMission, recordCompletion } from "./records.js";
import { flightFeedback } from "./feedback.js";
import { publishProgress, clearProgress } from "./progress.js";

const KEY = "orbit-courier-v2";
let record = normalizeRecord(loadLocal(KEY, {}));
const restored = record.recent[0];
let seed = restored?.seed ?? freshSeed(), stage = restored?.stage ?? 1, scene, phase = "aim", attempts = 0, hinted = false;
let trails = [], flight = null, prediction = null, cursor = 0, playTime = 0, frame = 0, last = 0, dragging = false;
const canvas = $("space"), ctx = canvas.getContext("2d");
let stars = [];
const value = (id) => Number($(id).value);
const plan = () => ({ angle: value("angle"), power: value("power"), burn: value("burn"), burnAt: value("burnAt") });
const n = (number, digits = 1) => Number.isFinite(number) ? number.toFixed(digits) : "—";
const labels = { orbit: "궤도 유지", escape: "탈출", delivery: "속도 제한 배송", flyby: "근접 통과 배송" };

function save() {
  const saved = saveLocal(KEY, record);
  if (!saved) announce("저장 불가 · 현재 세션에서만 유지됩니다.");
  return saved;
}
function checkpoint() {
  record = rememberMission(record, { seed, stage, attempts, hinted, plan: plan() });
  recentControls();
  return save();
}
function recentControls() {
  $("recent").replaceChildren(...record.recent.map((r) => Object.assign(document.createElement("option"), {
    value: r.seed, textContent: `${r.seed} · 임무 ${r.stage}`,
  })));
  $("recent").disabled = $("open-recent").disabled = $("continue").disabled = !record.recent.length;
  $("resume-copy").textContent = record.recent.length ? `마지막 코드 ${record.recent[0].seed} · 임무 ${record.recent[0].stage}` : "저장한 코드 없음";
}
function setPlan(p) {
  for (const id of ["angle", "power", "burn", "burnAt"]) {
    const step = Number($(id).step);
    $(id).value = String(Math.round(p[id] / step) * step);
  }
}
function controls() {
  const locked = phase !== "aim";
  for (const id of ["angle", "power", "burn", "burnAt"]) {
    $(id).disabled = locked;
    $(id + "-output").value = n(value(id), id === "burnAt" ? 2 : 1) + (id === "angle" ? "°" : "");
  }
  $("launch").disabled = ["success", "failure"].includes(phase);
  $("launch").textContent = phase === "flying" ? "일시정지" : phase === "paused" ? "비행 계속" : "임무 실행";
  $("hint").disabled = $("reference").disabled = $("preview").disabled = locked;
}
function requirements() {
  const m = scene.mission;
  if (m.type === "orbit") return [
    `중심 반경 ${n(m.radius * (1 - m.tolerance))}–${n(m.radius * (1 + m.tolerance))} 유지`,
    `중심 행성 기준 이심률 e ≤ ${m.maxEccentricity} (원에 가까울수록 0)`,
    `두 조건을 연속 ${m.turns}바퀴 유지 · 벗어나면 진행률 초기화`,
  ];
  if (m.type === "escape") return [`중심 반경 ${m.radius} 이상의 탈출 경계 통과`, "총 비에너지 E > 0 · 바깥 방향 속도 > 0"];
  const result = [`정거장 중심에서 ${scene.target.radius} 이내로 진입`, `진입 속도 ≤ ${scene.target.maxSpeed} · 충돌 없이 도착`];
  if (m.type === "flyby") result.unshift(`아틀라스 반경 ${m.near} 이내 → ${m.exit} 밖 · 무분사 방향 전환 ≥ ${m.minTurn}°`);
  return result;
}
function sector(resume, persist = true) {
  cancelAnimationFrame(frame);
  dragging = false; phase = "aim"; attempts = 0; hinted = false;
  if (resume) { seed = resume.seed; stage = resume.stage; attempts = resume.attempts; hinted = resume.hinted; }
  trails = []; flight = null; prediction = null; cursor = 0; playTime = 0;
  scene = makeSector(stage, seed);
  setPlan(resume?.plan ?? scene.defaults);
  const random = rng(seed + "stars");
  stars = Array.from({ length: 100 }, () => ({ x: random() * 900, y: random() * 560, size: random() * 1.4 + 0.4 }));
  $("sector").textContent = `임무 ${stage} / ${TITLES.length} · ${scene.variant}`;
  $("mission-title").textContent = scene.title;
  $("mission-copy").textContent = scene.lesson;
  $("mission-type").textContent = labels[scene.mission.type];
  $("objectives").replaceChildren(...requirements().map((text) => Object.assign(document.createElement("li"), { textContent: text })));
  $("stage").replaceChildren(...TITLES.map((title, i) => Object.assign(document.createElement("option"), {
    value: String(i + 1), textContent: `${i + 1 > record.unlocked ? "잠김 · " : ""}${i + 1}. ${title}`, disabled: i + 1 > record.unlocked,
  })));
  $("stage").value = String(stage);
  $("seed").value = seed;
  $("attempts").textContent = String(attempts).padStart(2, "0");
  $("best").textContent = record.best[seed + "-" + stage] || "—";
  $("progress-copy").textContent = `${record.unlocked} / ${TITLES.length} 임무 열림`;
  $("outcome").hidden = $("next").hidden = true;
  $("result-chart").hidden = true;
  $("flight-state").textContent = "발사 준비";
  $("status").textContent = hinted ? "힌트 사용 · 성공 점수 −120" : "발사 준비";
  updatePlan();
  if (persist) checkpoint(); else recentControls();
}
function updatePlan() {
  controls();
  if (phase === "aim") {
    const p = plan();
    prediction = simulate(scene, p.angle, p.power, p);
    telemetry(prediction.path[0]);
    $("prediction-copy").textContent = $("preview").checked ? `예상 결과: ${prediction.status === "success" ? "목표 달성 가능" : prediction.reason} · T+${n(prediction.time, 2)}` : "예상 궤적 꺼짐 · 발사 벡터만 표시";
  }
  draw();
}
function telemetry(point) {
  const q = point.metrics, m = scene.mission;
  $("telemetry").textContent = `T+${n(point.t, 2)} / 40 · 모형 시간`;
  $("speed-now").textContent = n(q.speed);
  $("radius-now").textContent = n(q.radius);
  $("energy-now").textContent = n(q.conservedEnergy, 0);
  $("ecc-now").textContent = n(q.eccentricity, 3);
  $("burn-state").textContent = value("burn") === 0 ? "예약 분사 없음" : q.burnDone ? "예약 분사 완료" : `T+${n(value("burnAt"), 2)}에 Δv ${value("burn") > 0 ? "+" : ""}${n(value("burn"))}`;
  let progress = 0, text = "";
  if (m.type === "orbit") {
    progress = Math.min(100, q.turns / m.turns * 100);
    text = `${q.orbitActive ? "유지 중" : "궤도 조건 대기"} · ${n(q.turns, 2)} / ${m.turns}바퀴`;
  } else if (m.type === "escape") {
    progress = Math.min(100, q.radius / m.radius * 100);
    text = `반경 ${n(q.radius)} / ${m.radius} · E ${q.conservedEnergy > 1e-6 ? "> 0 충족" : "≤ 0 미달"} · 방사속도 ${n(q.radialSpeed)}`;
  } else {
    progress = Math.max(0, Math.min(100, (1 - Math.max(0, q.closestTarget - scene.target.radius) / Math.hypot(scene.start.x - scene.target.x, scene.start.y - scene.target.y)) * 100));
    text = `정거장 최근접 ${n(q.closestTarget)} / ${scene.target.radius} · 속도 ${n(q.speed)} / ${scene.target.maxSpeed}`;
    if (m.type === "flyby") text += ` · 근접 통과 ${q.flyby ? "완료" : q.near ? "탈출 대기" : "미완료"} (${n(q.turn)}°)`;
  }
  $("mission-progress").value = progress;
  $("metric-status").textContent = text;
}
function line(path, color, dashed = false, width = 2) {
  if (path.length < 2) return;
  ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [4, 7] : []); ctx.stroke(); ctx.setLineDash([]);
}
function circle(x, y, radius, color, dashed = false, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [5, 8] : []);
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
function text(label, x, y, color = "#9bb5c5") {
  ctx.fillStyle = color; ctx.font = '13px "Malgun Gothic", sans-serif'; ctx.fillText(label, x, y);
}
function draw() {
  ctx.clearRect(0, 0, 900, 560); ctx.fillStyle = "#050e17"; ctx.fillRect(0, 0, 900, 560);
  ctx.fillStyle = "#638190";
  for (const star of stars) ctx.fillRect(star.x, star.y, star.size, star.size);
  for (let x = 0; x <= 900; x += 100) line([{ x, y: 0 }, { x, y: 560 }], "#122b38", false, 1);
  for (let y = 0; y <= 560; y += 80) line([{ x: 0, y }, { x: 900, y }], "#122b38", false, 1);
  const m = scene.mission, primary = scene.bodies[0];
  if (m.type === "orbit") {
    circle(primary.x, primary.y, m.radius, "#6bbddc38", false, m.radius * m.tolerance * 2);
    circle(primary.x, primary.y, m.radius, "#73c7e6", true);
    text(`목표 궤도 r=${m.radius}`, primary.x - 65, primary.y - m.radius - 18, "#73c7e6");
  }
  if (m.type === "escape") {
    circle(primary.x, primary.y, m.radius, "#73c7e6", true, 2);
    text(`탈출 경계 r=${m.radius} · E > 0`, primary.x - 80, primary.y - m.radius + 20, "#73c7e6");
  }
  if (m.type === "flyby") {
    const b = scene.bodies[m.body];
    circle(b.x, b.y, m.near, "#ffd27a", false, 2); circle(b.x, b.y, m.exit, "#ffd27a", true);
    text("무분사 근접 통과 구역", b.x - 72, b.y - m.exit - 10, "#ffd27a");
  }
  for (const b of scene.bodies) {
    const gradient = ctx.createRadialGradient(b.x - b.radius * 0.4, b.y - b.radius * 0.4, 1, b.x, b.y, b.radius);
    gradient.addColorStop(0, b.color); gradient.addColorStop(1, "#192a35");
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
    circle(b.x, b.y, b.radius, b.color);
    text(b.name, b.x - 24, b.y + b.radius + 22);
  }
  if (scene.target) {
    const t = scene.target;
    circle(t.x, t.y, t.radius, "#c4fb5c", false, 2); circle(t.x, t.y, t.radius + 7, "#c4fb5c80");
    line([{ x: t.x - 6, y: t.y }, { x: t.x + 6, y: t.y }], "#c4fb5c");
    text(`배송 · 속도 ≤ ${t.maxSpeed}`, t.x - 65, t.y - t.radius - 18, "#c4fb5c");
  }
  circle(scene.start.x, scene.start.y, 7, "#f1f5f0");
  text("START", scene.start.x + 13, scene.start.y + 18);
  for (const trail of trails) line(trail, "#758b9966", true);
  if (phase === "aim" && prediction && $("preview").checked) {
    line(prediction.path, "#73c7e690", true);
    for (const e of prediction.events.filter((e) => e.type === "burn")) {
      circle(e.x, e.y, 8, "#ffd27a", true); text("Δv 예약", e.x + 12, e.y - 8, "#ffd27a");
    }
    const end = prediction.path.at(-1);
    circle(end.x, end.y, 6, prediction.status === "success" ? "#c4fb5c" : "#ff978c");
  }
  if (flight) {
    const visible = flight.path.slice(0, cursor + 1);
    line(visible, phase === "failure" ? "#ff978c" : "#c4fb5c", false, 2.5);
    for (let i = 60; i < visible.length; i += 60) {
      const p = visible[i]; circle(p.x, p.y, 2, "#edf2ec");
    }
    for (const e of flight.events.filter((e) => ["burn", "flyby"].includes(e.type) && e.t <= flight.path[cursor].t)) {
      circle(e.x, e.y, 8, "#ffd27a", false, 2); text(e.type === "burn" ? "Δv 분사" : "근접 통과 ✓", e.x + 12, e.y - 8, "#ffd27a");
    }
  }
  if (phase === "aim") {
    const rad = value("angle") * Math.PI / 180, length = value("power") * 0.6;
    line([scene.start, { x: scene.start.x + Math.cos(rad) * length, y: scene.start.y + Math.sin(rad) * length }], "#f2f4f0", false, 2);
  }
  const point = flight ? flight.path[cursor] : { ...scene.start, vx: Math.cos(value("angle") * Math.PI / 180), vy: Math.sin(value("angle") * Math.PI / 180) };
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(Math.atan2(point.vy, point.vx));
  ctx.fillStyle = "#edf2ec"; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -6); ctx.lineTo(-5, 0); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill(); ctx.restore();
}
function resultChart(data) {
  const svg = $("radius-chart");
  svg.replaceChildren();
  const add = (tag, attributes, label) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    if (label !== undefined) el.textContent = label;
    svg.append(el); return el;
  };
  const duration = Math.max(flight.time, 0.01);
  const x = (t) => 58 + t / duration * 396;
  const panel = (top, key, label, values, target, band) => {
    const low = Math.min(...values, target, ...(band ?? [])), high = Math.max(...values, target, ...(band ?? []));
    const pad = Math.max(1, (high - low) * 0.1), min = low - pad, max = high + pad;
    const y = (v) => top + 100 - (v - min) / (max - min) * 100;
    add("text", { x: 58, y: top - 12, class: "chart-label" }, label);
    if (band) add("rect", { x: 58, y: y(band[1]), width: 396, height: y(band[0]) - y(band[1]), class: "chart-band" });
    for (const value of [min, (min + max) / 2, max]) {
      add("line", { x1: 58, x2: 454, y1: y(value), y2: y(value), class: "chart-grid" });
      add("text", { x: 50, y: y(value) + 4, "text-anchor": "end", class: "chart-tick" }, n(value, 0));
    }
    add("line", { x1: 58, x2: 454, y1: y(target), y2: y(target), class: "chart-target" });
    add("polyline", { points: data.points.map((p) => `${x(p.t)},${y(p[key])}`).join(" "), class: "chart-observed" });
    for (const event of flight.events.filter((e) => e.type === "burn")) {
      add("line", { x1: x(event.t), x2: x(event.t), y1: top, y2: top + 100, class: "chart-burn" });
    }
    for (const t of [0, duration / 2, duration]) add("text", { x: x(t), y: top + 119, "text-anchor": "middle", class: "chart-tick" }, n(t, 2));
  };
  panel(32, "observed", `${data.label} · ${data.condition} ${n(data.target, 0)}`, data.points.map((p) => p.observed), data.target, data.band);
  panel(190, "error", "오차 = 관측 거리 − 목표 거리", data.points.map((p) => p.error), 0,
    data.band ? data.band.map((v) => v - data.target) : null);
  add("text", { x: 454, y: 335, "text-anchor": "end", class: "chart-tick" }, "모형 시간 T+");
  $("chart-caption").textContent = `실행 표본 · 종료 오차 ${n(data.endError)} · 최대 |오차| ${n(data.maxAbsoluteError)}. 점선: 목표 · 음영: 허용 반경 · 노랑: 분사.`;
  svg.setAttribute("aria-label", `${data.label}와 오차의 시간 그래프. ${$("chart-caption").textContent}`);
  $("result-chart").hidden = false;
}
function end() {
  phase = flight.status === "success" ? "success" : "failure";
  $("flight-state").textContent = phase === "success" ? "임무 성공" : "임무 실패";
  const score = flightScore(flight, value("power"), attempts, hinted);
  const feedback = flightFeedback(scene, flight);
  const heading = Object.assign(document.createElement("h2"), { textContent: phase === "success" ? `임무 성공 · ${score}점` : "조건 미충족" });
  const detail = Object.assign(document.createElement("p"), { textContent: feedback.diagnosis });
  $("outcome").replaceChildren(heading, detail); $("outcome").hidden = false;
  resultChart(feedback);
  if (phase === "success") {
    const key = seed + "-" + stage;
    record = recordCompletion(record, seed, stage, flight, score, hinted);
    if (checkpoint() && !hinted) {
      try { if (!publishProgress(localStorage, record.completed.length, TITLES.length)) announce("갤러리 완료 수 저장 불가."); }
      catch { announce("갤러리 완료 수 저장 불가."); }
    }
    $("best").textContent = record.best[key];
    $("next").hidden = stage === TITLES.length;
    for (const option of $("stage").options) {
      option.disabled = Number(option.value) > record.unlocked;
      if (!option.disabled) option.textContent = `${option.value}. ${TITLES[Number(option.value) - 1]}`;
    }
    $("progress-copy").textContent = `${record.unlocked} / ${TITLES.length} 임무 열림`;
    $("status").textContent = stage === TITLES.length ? "전체 임무 해금" : "다음 임무 열림";
  } else $("status").textContent = "다시 조준하여 설정을 바꾸세요.";
  controls(); draw();
}
function animate(now) {
  if (phase !== "flying") return;
  const delta = last ? Math.min(0.08, (now - last) / 1000) : 0;
  last = now; playTime += delta * value("playback");
  while (cursor + 1 < flight.path.length && flight.path[cursor + 1].t <= playTime) cursor++;
  telemetry(flight.path[cursor]); draw();
  if (cursor >= flight.path.length - 1) end(); else frame = requestAnimationFrame(animate);
}
function launch() {
  dragging = false;
  if (phase === "flying") {
    phase = "paused"; cancelAnimationFrame(frame); $("flight-state").textContent = "일시정지"; controls(); return;
  }
  if (phase === "paused") {
    phase = "flying"; last = 0; $("flight-state").textContent = "비행 중"; controls(); frame = requestAnimationFrame(animate); return;
  }
  if (phase !== "aim") return;
  attempts = Math.min(1000000, attempts + 1); $("attempts").textContent = String(attempts).padStart(2, "0");
  const p = plan(); flight = simulate(scene, p.angle, p.power, p);
  checkpoint();
  cursor = 0; playTime = 0; last = 0; phase = "flying";
  $("outcome").hidden = $("result-chart").hidden = true; $("flight-state").textContent = "비행 중";
  $("prediction-copy").textContent = "실행 궤적 · 점 간격: 모형 시간 1";
  controls(); frame = requestAnimationFrame(animate);
}
function retry() {
  cancelAnimationFrame(frame); dragging = false;
  if (flight) trails.push(flight.path.slice(0, cursor + 1));
  trails = trails.slice(-3); phase = "aim"; flight = null; cursor = 0; playTime = 0;
  $("outcome").hidden = $("next").hidden = true; $("flight-state").textContent = "발사 준비";
  $("result-chart").hidden = true;
  $("status").textContent = "직전 비행: 회색 점선";
  updatePlan();
}
for (const id of ["angle", "power", "burn", "burnAt"]) $(id).oninput = () => { updatePlan(); checkpoint(); };
$("preview").oninput = updatePlan;
$("launch").onclick = launch; $("retry").onclick = retry;
$("reset").onclick = () => sector();
$("hint").onclick = () => {
  if (phase !== "aim") return;
  hinted = true; $("status").textContent = scene.hint + " · 이번 임무 힌트 감점 −120.";
  checkpoint();
};
$("reference").onclick = () => {
  if (phase !== "aim") return;
  hinted = true; setPlan(scene.reference); updatePlan();
  $("status").textContent = "참고 계획 적용 · 성공 점수 −120";
  checkpoint();
};
$("next").onclick = () => { if (phase === "success" && stage < TITLES.length) { stage++; sector(); } };
$("stage").onchange = () => {
  const selected = value("stage");
  if (Number.isInteger(selected) && selected >= 1 && selected <= record.unlocked) { stage = selected; sector(); }
};
function openCode(nextSeed) {
  seed = nextSeed;
  const previous = record.recent.find((r) => r.seed === seed);
  stage = previous?.stage ?? 1; sector(previous);
}
$("apply-seed").onclick = () => { try { openCode(cleanSeed($("seed").value)); } catch (e) { announce(e.message); } };
$("new-route").onclick = () => { seed = freshSeed(); stage = 1; sector(); };
$("continue").onclick = () => { if (record.recent[0]) sector(record.recent[0]); };
$("open-recent").onclick = () => { const selected = record.recent.find((r) => r.seed === $("recent").value); if (selected) sector(selected); };
$("clear").onclick = () => {
  if (!confirm("이 브라우저의 구버전·현재 임무 기록과 해금을 모두 삭제할까요?")) return;
  record = normalizeRecord({});
  try {
    localStorage.removeItem(KEY); localStorage.removeItem("orbit-courier-v1");
    const cleared = clearProgress(localStorage);
    announce(cleared ? "임무 기록 삭제 완료." : "임무 기록 삭제 완료 · 갤러리 요약 삭제 불가.");
  }
  catch { announce("브라우저가 기록 삭제를 차단했습니다. 현재 세션의 기록만 초기화했습니다."); }
  stage = 1; sector(undefined, false);
};
function aimAt(e) {
  if (phase !== "aim") return;
  const box = canvas.getBoundingClientRect();
  const dx = (e.clientX - box.left) * 900 / box.width - scene.start.x;
  const dy = (e.clientY - box.top) * 560 / box.height - scene.start.y;
  $("angle").value = String(Math.round(Math.atan2(dy, dx) * 180 / Math.PI));
  $("power").value = String(Math.max(20, Math.min(320, Math.round(Math.hypot(dx, dy) / 0.6))));
  updatePlan();
  checkpoint();
}
canvas.onpointerdown = (e) => {
  if (phase !== "aim" || !e.isPrimary || e.button !== 0) return;
  dragging = true; canvas.setPointerCapture(e.pointerId); aimAt(e);
};
canvas.onpointermove = (e) => { if (dragging) aimAt(e); };
canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = () => { dragging = false; };
canvas.onkeydown = (e) => {
  if (e.key === " ") { e.preventDefault(); launch(); }
  else if (phase === "aim" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const id = ["ArrowLeft", "ArrowRight"].includes(e.key) ? "angle" : "power";
    $(id).value = String(value(id) + (["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1)); updatePlan(); checkpoint();
  }
};
const pause = () => { if (phase === "flying") launch(); };
addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("pagehide", pause);
tool("configure_flight", "항로와 발사·분사 설정", {
  type: "object", properties: {
    stage: { type: "integer", minimum: 1, maximum: TITLES.length }, seed: { type: "string", maxLength: 40 },
    ...Object.fromEntries(Object.entries(LIMITS).map(([key, [minimum, maximum]]) => [key, { type: "number", minimum, maximum }])),
  }, required: ["stage", "seed", "angle", "power"], additionalProperties: false,
}, (input) => {
  if (!input || !Number.isInteger(input.stage) || input.stage < 1 || input.stage > record.unlocked) throw Error("Invalid mission");
  const candidate = { angle: input.angle, power: input.power, burn: input.burn ?? 0, burnAt: input.burnAt ?? 4 };
  for (const [key, [min, max]] of Object.entries(LIMITS)) if (!Number.isFinite(candidate[key]) || candidate[key] < min || candidate[key] > max) throw Error("Invalid flight configuration");
  const nextSeed = cleanSeed(input.seed);
  seed = nextSeed; stage = input.stage; sector(); setPlan(candidate); updatePlan(); checkpoint();
  return { stage, seed, ...plan(), state: phase };
});
sector(restored);
