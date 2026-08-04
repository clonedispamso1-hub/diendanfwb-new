// Per-viewer follow tracker — localStorage so the UI feels real
// (Phase 2 sẽ chuyển sang Supabase follows table)
const KEY = "nfwb:follows:v1";

// Cached snapshot — MUST return same reference until contents change.
// Returning `new Set()` every call breaks useSyncExternalStore and causes
// React error #185 (Maximum update depth exceeded).
let cachedSet: Set<string> = new Set();
let cachedSerialized = "";
let hydrated = false;

function readFromStorage(): { set: Set<string>; serialized: string } {
  if (typeof window === "undefined") return { set: new Set(), serialized: "[]" };
  try {
    const raw = window.localStorage.getItem(KEY) || "[]";
    const arr = JSON.parse(raw);
    const set = new Set<string>(Array.isArray(arr) ? arr : []);
    return { set, serialized: raw };
  } catch {
    return { set: new Set(), serialized: "[]" };
  }
}

function refreshCache() {
  const { set, serialized } = readFromStorage();
  // Only swap reference if the underlying data actually changed.
  if (!hydrated || serialized !== cachedSerialized) {
    cachedSet = set;
    cachedSerialized = serialized;
    hydrated = true;
  }
}

function persist(set: Set<string>) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify([...set]);
  try {
    window.localStorage.setItem(KEY, serialized);
  } catch { /* noop */ }
  cachedSet = set;
  cachedSerialized = serialized;
  hydrated = true;
  window.dispatchEvent(new CustomEvent("nfwb:follow-change"));
}

export function isFollowed(id: string): boolean {
  refreshCache();
  return cachedSet.has(id);
}

export function toggleFollow(id: string): boolean {
  refreshCache();
  const next = new Set(cachedSet);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  persist(next);
  return next.has(id);
}

export function getFollowSet(): Set<string> {
  refreshCache();
  return cachedSet;
}

const EMPTY_SET: Set<string> = new Set();
export function getFollowSetServer(): Set<string> {
  return EMPTY_SET;
}

export function subscribeFollow(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    // Storage event from another tab — re-read before notifying.
    refreshCache();
    cb();
  };
  window.addEventListener("nfwb:follow-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("nfwb:follow-change", handler);
    window.removeEventListener("storage", handler);
  };
}
