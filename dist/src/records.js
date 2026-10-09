import { TITLES, LIMITS } from "./model.js";

export const RECENT_LIMIT = 8;
export const BEST_LIMIT = 100;
const code = (s) => typeof s === "string" && /^[A-Za-z0-9-]{1,40}$/.test(s);
const stageOK = (v) => Number.isInteger(v) && v >= 1 && v <= TITLES.length;
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const validPlan = (p) => object(p) && Object.entries(LIMITS).every(([k, [lo, hi]]) => Number.isFinite(p[k]) && p[k] >= lo && p[k] <= hi);

// Pure projection: retain only bounded, known fields from untrusted local JSON.
export function normalizeRecord(input) {
  const source = object(input) ? input : {};
  const unlocked = stageOK(source.unlocked) ? source.unlocked : 1;
  const best = {};
  if (object(source.best)) for (const [key, score] of Object.entries(source.best).slice(-BEST_LIMIT)) {
    if (/^[A-Za-z0-9-]{1,40}-[1-6]$/.test(key) && Number.isInteger(score) && score >= 50 && score <= 1500) best[key] = score;
  }
  const recent = [];
  if (Array.isArray(source.recent)) for (const item of source.recent.slice(0, RECENT_LIMIT)) {
    if (!object(item) || !code(item.seed) || !stageOK(item.stage) || item.stage > unlocked || recent.some((r) => r.seed === item.seed)) continue;
    recent.push({ seed: item.seed, stage: item.stage,
      attempts: Number.isInteger(item.attempts) && item.attempts >= 0 && item.attempts <= 1000000 ? item.attempts : 0,
      hinted: item.hinted === true,
      ...(validPlan(item.plan) ? { plan: Object.fromEntries(Object.keys(LIMITS).map((k) => [k, item.plan[k]])) } : {}),
    });
  }
  const completed = Array.isArray(source.completed) ? [...new Set(source.completed.filter(stageOK))].sort((a, b) => a - b) : [];
  return { unlocked, best, recent, completed };
}

export function rememberMission(record, checkpoint) {
  if (!code(checkpoint?.seed) || !stageOK(checkpoint.stage) || checkpoint.stage > normalizeRecord(record).unlocked || !validPlan(checkpoint.plan)) throw new TypeError("Invalid checkpoint");
  const next = normalizeRecord(record);
  next.recent = [checkpoint, ...next.recent.filter((r) => r.seed !== checkpoint.seed)].slice(0, RECENT_LIMIT);
  return normalizeRecord(next);
}

export function recordCompletion(record, seed, stage, result, score, hinted) {
  const next = normalizeRecord(record);
  if (!code(seed) || !stageOK(stage) || stage > next.unlocked) throw new TypeError("Invalid completion");
  if (result.status !== "success") return next;
  if (!Number.isInteger(score) || score < 50 || score > 1500 || typeof hinted !== "boolean") throw new TypeError("Invalid score");
  const key = `${seed}-${stage}`;
  next.best[key] = Math.max(next.best[key] || 0, score);
  while (Object.keys(next.best).length > BEST_LIMIT) delete next.best[Object.keys(next.best)[0]];
  next.unlocked = Math.max(next.unlocked, Math.min(TITLES.length, stage + 1));
  if (!hinted) next.completed = [...new Set([...next.completed, stage])].sort((a, b) => a - b);
  return next;
}
