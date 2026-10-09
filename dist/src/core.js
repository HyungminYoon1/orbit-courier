export function hashSeed(value) {
  let h = 2166136261;
  for (const c of String(value)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let x = hashSeed(seed);
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function freshSeed() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36)).join("-");
}
export function cleanSeed(s) {
  if (
    typeof s !== "string" ||
    !s.trim() ||
    !/^[A-Za-z0-9-]{1,40}$/.test(s.trim())
  )
    throw Error("도전 코드는 영문·숫자·하이픈 1–40자로 입력하세요.");
  return s.trim();
}
export function loadLocal(key, fallback, limit = 65536) {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length <= limit ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function tool(name, title, schema, execute) {
  const ctx = document.modelContext;
  if (!ctx?.registerTool) return;
  const lifecycle = new AbortController();
  addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(
      ctx.registerTool(
        {
          name,
          title,
          inputSchema: schema,
          description: title,
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute,
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
}
export const $ = (id) => document.getElementById(id);
export function announce(text) {
  const el = $("notice");
  if (el) el.textContent = text;
}
