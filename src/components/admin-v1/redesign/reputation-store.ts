/* ============================================================
   REPUTATION STORE (UI-first — sẽ nối với Supabase sau)
   Lưu tạm điểm uy tín + trạng thái khóa của "current user" trong
   localStorage để demo full flow: trừ điểm → popup → khóa nếu < 70.
   ============================================================ */

const KEY_SCORE = "ddx-reputation-score";
const KEY_PENDING = "ddx-reputation-pending"; // popup chưa hiển thị
const KEY_LOCKED_USERS = "ddx-locked-users"; // set uid đã bị khóa (cho icon ổ khóa)

export type ReputationPenalty = {
  amount: number;
  reason: string;
  reasonKey: string;
  targetUsername?: string;
  targetUid?: string;
  at: string; // ISO
};

export function getReputation(): number {
  if (typeof window === "undefined") return 100;
  const raw = localStorage.getItem(KEY_SCORE);
  const n = raw ? Number(raw) : 100;
  return Number.isFinite(n) ? n : 100;
}

export function setReputation(score: number) {
  localStorage.setItem(KEY_SCORE, String(Math.max(0, Math.min(100, Math.round(score)))));
  window.dispatchEvent(new CustomEvent("ddx:reputation-change"));
}

export function resetReputation() {
  setReputation(100);
  localStorage.removeItem(KEY_PENDING);
  window.dispatchEvent(new CustomEvent("ddx:reputation-pending"));
}

export function applyPenaltyToCurrentUser(p: ReputationPenalty) {
  const next = Math.max(0, getReputation() - p.amount);
  setReputation(next);
  // enqueue popup
  const queue = getPendingPenalties();
  queue.push(p);
  localStorage.setItem(KEY_PENDING, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("ddx:reputation-pending"));
}

export function getPendingPenalties(): ReputationPenalty[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY_PENDING) || "[]");
  } catch {
    return [];
  }
}

export function shiftPendingPenalty(): ReputationPenalty | null {
  const q = getPendingPenalties();
  const first = q.shift() || null;
  localStorage.setItem(KEY_PENDING, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent("ddx:reputation-pending"));
  return first;
}

export function isLockedUser(uid: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const set = new Set<string>(JSON.parse(localStorage.getItem(KEY_LOCKED_USERS) || "[]"));
    return set.has(uid);
  } catch {
    return false;
  }
}

export function markUserLocked(uid: string) {
  const set = new Set<string>(getLockedUsers());
  set.add(uid);
  localStorage.setItem(KEY_LOCKED_USERS, JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent("ddx:locked-users-change"));
}

export function getLockedUsers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY_LOCKED_USERS) || "[]");
  } catch {
    return [];
  }
}

/* Bảng mức trừ điểm theo lý do vi phạm */
export const PENALTY_TABLE: { key: string; label: string; amount: number }[] = [
  { key: "spam", label: "Spam", amount: 5 },
  { key: "harass", label: "Quấy rối", amount: 10 },
  { key: "scam", label: "Lừa đảo", amount: 20 },
  { key: "banned", label: "Nội dung cấm", amount: 30 },
];
