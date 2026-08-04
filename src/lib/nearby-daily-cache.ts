/**
 * Persistent daily picks for "Tìm quanh đây".
 *
 * Selects up to 20 clone profile ids per (user, day) and persists them in
 * localStorage so the list is stable across navigation, reloads and tab
 * switches. A clone is rotated out only when the user has "consumed" it
 * (messaged/quan tâm/follow) or when a new day starts.
 */

const QUOTA = 20;

function ymd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function keyPicks(uid: string) {
  return `nearby:dailyPicks:v1::${uid}::${ymd()}`;
}
function keyInteracted(uid: string) {
  return `nearby:interacted:v1::${uid}`;
}

export interface DailyPicks {
  ids: string[];
  ymd: string;
}

export function loadDailyPicks(uid: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyPicks(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export function saveDailyPicks(uid: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyPicks(uid), JSON.stringify(ids.slice(0, QUOTA)));
  } catch { /* noop */ }
}

/** Replace a single consumed pick with a fresh candidate (from candidatePool). */
export function rotateOutPick(uid: string, consumedId: string, candidatePool: string[]) {
  const picks = loadDailyPicks(uid);
  if (!picks.includes(consumedId)) return picks;
  const used = new Set(picks);
  const next = candidatePool.find((c) => !used.has(c));
  const replaced = picks.map((id) => (id === consumedId && next ? next : id))
    .filter((id) => id !== consumedId || next); // drop if no replacement
  saveDailyPicks(uid, replaced);
  return replaced;
}

/** Ensure we have up to QUOTA picks; fills from the candidate pool deterministically. */
export function ensureDailyPicks(uid: string, candidateIds: string[]): string[] {
  const existing = loadDailyPicks(uid).filter((id) => candidateIds.includes(id));
  if (existing.length >= QUOTA) {
    return existing.slice(0, QUOTA);
  }
  const used = new Set(existing);
  const fill = candidateIds.filter((id) => !used.has(id)).slice(0, QUOTA - existing.length);
  const picks = [...existing, ...fill];
  saveDailyPicks(uid, picks);
  return picks;
}

/* ============ Interacted set (for "Đang hoạt động") ============ */

export function loadInteracted(uid: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyInteracted(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export function markInteracted(uid: string, otherId: string) {
  if (typeof window === "undefined") return;
  const cur = loadInteracted(uid);
  if (cur.includes(otherId)) return;
  const next = [otherId, ...cur].slice(0, 50);
  try {
    window.localStorage.setItem(keyInteracted(uid), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("nearby:interacted-change"));
  } catch { /* noop */ }
}

export function subscribeInteracted(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener("nearby:interacted-change", h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener("nearby:interacted-change", h);
    window.removeEventListener("storage", h);
  };
}
