// Pure read-only feedback from the fixed-step simulation; never a success judge.
export function flightFeedback(scene, result) {
  const m = scene.mission;
  const delivery = m.type === "delivery" || m.type === "flyby";
  const target = delivery ? scene.target.radius : m.radius;
  const points = result.path.map((p) => {
    const observed = delivery ? Math.hypot(p.x - scene.target.x, p.y - scene.target.y) : p.metrics?.radius;
    return { t: p.t, observed, error: observed - target };
  }).filter((p) => [p.t, p.observed, p.error].every(Number.isFinite));
  const band = m.type === "orbit" ? [target * (1 - m.tolerance), target * (1 + m.tolerance)] : null;
  const round = (v, digits = 1) => Number.isFinite(v) ? v.toFixed(digits) : "—";
  const q = result.metrics;
  let diagnosis = result.reason;
  if (result.status !== "success" && q) {
    if (m.type === "orbit") {
      const unmet = [];
      if (Math.abs(q.radius - target) > target * m.tolerance) unmet.push(`반경 ${round(q.radius)} / ${round(band[0])}–${round(band[1])}`);
      if (q.eccentricity > m.maxEccentricity) unmet.push(`이심률 ${round(q.eccentricity, 3)} > ${m.maxEccentricity}`);
      unmet.push(`연속 회전 ${round(q.turns, 2)} / ${m.turns}바퀴`);
      diagnosis += " " + unmet.join(" · ");
    } else if (m.type === "escape") {
      diagnosis += ` 반경 ${round(q.radius)} / ${target} · E ${round(q.conservedEnergy, 0)} (>0 필요) · 바깥 속도 ${round(q.radialSpeed)} (>0 필요)`;
    } else {
      const arrivals = result.events.filter((e) => e.type === "arrival");
      const tooFast = arrivals.find((e) => e.speed > scene.target.maxSpeed);
      if (tooFast) diagnosis += ` 진입 속도 ${round(tooFast.speed)} > ${scene.target.maxSpeed} · T+${round(tooFast.t, 2)}`;
      else if (arrivals.length && m.type === "flyby" && !q.flyby) diagnosis += " 정거장에 도착하기 전에 엔진 분사 없이 행성 곁을 지나 방향을 바꿔야 합니다.";
      else if (!arrivals.length) diagnosis += ` 최근접 표본 거리 ${round(Math.min(...points.map((p) => p.observed)))} / ${target}`;
    }
  }
  return { points, target, band, label: delivery ? "정거장 중심까지의 거리" : "행성 중심까지의 거리",
    condition: m.type === "orbit" ? "궤도 허용 거리" : m.type === "escape" ? "탈출 경계 이상" : "도착 구역 반경 이하",
    diagnosis, endError: points.at(-1)?.error ?? null,
    maxAbsoluteError: points.length ? Math.max(...points.map((p) => Math.abs(p.error))) : null };
}
