// FWB XP & Level system — client-side (localStorage), event bus for UI.
// Replaces the "26/30 swipes" quota with a progression system.

const KEY = "fwb:xp:v1";
const DAILY_KEY = "fwb:xp:daily:v1";
const PROFILE_BONUS_KEY = "fwb:xp:profile-bonus:v1";
const EVT = "fwb:xp-change";

export type XpReason =
  | "view_profile"
  | "like"
  | "match"
  | "daily_login"
  | "profile_complete"
  | "message_sent";

const REWARDS: Record<XpReason, number> = {
  view_profile: 5,
  like: 10,
  match: 50,
  daily_login: 20,
  profile_complete: 100,
  message_sent: 8,
};

export interface XpState {
  xp: number;
  level: number;
  expIntoLevel: number;
  expForLevel: number;
  nextThreshold: number;
  percent: number;
}

const EMPTY_STATE: XpState = {
  xp: 0,
  level: 1,
  expIntoLevel: 0,
  expForLevel: 1,
  nextThreshold: 1,
  percent: 0,
};

let cachedXp: number | null = null;
let cachedState: XpState = EMPTY_STATE;

// Level N requires cumulative XP = 100 * N * (N+1) / 2
function thresholdFor(level: number): number {
  if (level <= 1) return 0;
  return 100 * ((level - 1) * level) / 2;
}
function levelFromXp(xp: number): number {
  let lvl = 1;
  while (xp >= thresholdFor(lvl + 1) && lvl < 99) lvl++;
  return lvl;
}

export function getXpState(): XpState {
  const xp = readXp();
  if (cachedXp === xp) return cachedState;

  const level = levelFromXp(xp);
  const cur = thresholdFor(level);
  const next = thresholdFor(level + 1);
  const expForLevel = Math.max(1, next - cur);
  const expIntoLevel = Math.max(0, xp - cur);
  cachedXp = xp;
  cachedState = {
    xp,
    level,
    expIntoLevel,
    expForLevel,
    nextThreshold: next,
    percent: Math.min(100, Math.round((expIntoLevel / expForLevel) * 100)),
  };
  return cachedState;
}

function readXp(): number {
  if (typeof window === "undefined") return 0;
  try { return parseInt(localStorage.getItem(KEY) || "0", 10) || 0; } catch { return 0; }
}
function writeXp(v: number) {
  try { localStorage.setItem(KEY, String(Math.max(0, v))); } catch { /* */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
}

export function awardXp(reason: XpReason): { gained: number; state: XpState; leveledUp: boolean } {
  const before = getXpState();
  const gained = REWARDS[reason] || 0;
  writeXp(before.xp + gained);
  const state = getXpState();
  return { gained, state, leveledUp: state.level > before.level };
}

export function subscribeXp(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

/** Award daily login bonus once per calendar day. Returns gained XP (0 if already claimed). */
export function claimDailyLoginXp(): number {
  if (typeof window === "undefined") return 0;
  try {
    if (localStorage.getItem(DAILY_KEY) === todayKey()) return 0;
    localStorage.setItem(DAILY_KEY, todayKey());
  } catch { return 0; }
  return awardXp("daily_login").gained;
}

/** One-time profile-complete bonus. Pass a stable user id to scope per account. */
export function claimProfileCompleteXp(userId: string | null | undefined): number {
  if (typeof window === "undefined" || !userId) return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_BONUS_KEY) || "[]");
    const seen = new Set<string>(Array.isArray(raw) ? raw : []);
    if (seen.has(userId)) return 0;
    seen.add(userId);
    localStorage.setItem(PROFILE_BONUS_KEY, JSON.stringify([...seen]));
  } catch { return 0; }
  return awardXp("profile_complete").gained;
}
