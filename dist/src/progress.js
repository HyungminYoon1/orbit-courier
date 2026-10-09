export const PROGRESS_KEY = "web-lab-progress-v1";
export const APP_IDS = Object.freeze([
  "data-mirage", "echo-vault", "light-route", "logic-foundry", "neon-tactics",
  "orbit-courier", "packet-journey", "parcel-panic", "pixel-kitchen", "pocket-city",
  "route-race", "sense-lab", "swarm-garden", "think-forge", "traffic-lab",
]);
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const valid = (v) => object(v) && Number.isInteger(v.total) && v.total >= 0 && v.total <= 1000 &&
  Number.isInteger(v.completed) && v.completed >= 0 && v.completed <= v.total &&
  typeof v.updatedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.updatedAt) &&
  Number.isFinite(Date.parse(v.updatedAt)) && new Date(v.updatedAt).toISOString() === v.updatedAt;

export function normalizeProgress(input) {
  if (!object(input) || input.version !== 1 || !object(input.apps)) throw new TypeError("Invalid summary");
  const apps = {};
  for (const id of APP_IDS) if (valid(input.apps[id])) {
    const { completed, total, updatedAt } = input.apps[id];
    apps[id] = { completed, total, updatedAt };
  }
  return { version: 1, apps };
}

// Only this app's aggregate is writable here. No seed, plan or flight enters this key.
export function publishProgress(storage, completed, total, updatedAt = new Date().toISOString()) {
  return changeOwn(storage, { completed, total, updatedAt });
}
export function clearProgress(storage) { return changeOwn(storage, null); }
function changeOwn(storage, own) {
  try {
    if (own !== null && !valid(own)) return false;
    const raw = storage.getItem(PROGRESS_KEY);
    if (raw !== null && raw.length > 8192) return false;
    const summary = raw === null ? { version: 1, apps: {} } : normalizeProgress(JSON.parse(raw));
    if (own === null) delete summary.apps["orbit-courier"];
    else summary.apps["orbit-courier"] = own;
    storage.setItem(PROGRESS_KEY, JSON.stringify(summary));
    return true;
  } catch { return false; }
}
