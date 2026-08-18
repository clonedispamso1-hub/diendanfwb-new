/**
 * Smart Tooltip cho Floating Dock — 100% frontend, không đụng DB.
 * - Tooltip nhỏ bên trái icon, hiện 3 giây rồi tự tắt.
 * - Thành viên mới: hiện lần lượt vài tooltip cách nhau 5–10s, mỗi cái 1 lần / phiên.
 * - Thành viên cũ: mỗi 60 phút dùng liên tục hiện ngẫu nhiên 1 tooltip.
 * - Badge "NEW" khi Admin đổi nội dung (link/label) của icon; mất khi bấm lần đầu.
 */
export type TipId = "facebook" | "zalo" | "gamexu" | "vip" | "follow";

export const DOCK_TIPS: Record<TipId, string> = {
  facebook: "👉 Theo dõi Fanpage Admin",
  zalo: "👉 Tham gia nhóm Zalo để nhận thông báo mới",
  gamexu: "👉 Chuyển tiền • Rút tiền • Lịch sử giao dịch",
  vip: "👉 Hướng dẫn tham gia nhóm VIP Zalo",
  follow: "❤️ Xem ai vừa theo dõi bạn",
};

const SEEN_KEY = "fdock:tips:visited";
const SESSION_KEY = "fdock:tips:session";
const SIG_KEY = "fdock:sig:";

export const TIP_DURATION = 3000;
export const RETURNING_INTERVAL = 60 * 60 * 1000;

function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(store: Storage | undefined, key: string, value: string) {
  try {
    store?.setItem(key, value);
  } catch {
    /* noop */
  }
}

const ls = typeof window !== "undefined" ? window.localStorage : undefined;
const ss = typeof window !== "undefined" ? window.sessionStorage : undefined;

/** Lần đầu vào website (chưa từng ghi dấu) → thành viên mới. */
export function isNewVisitor(): boolean {
  return safeGet(ls, SEEN_KEY) !== "1";
}
export function markVisited() {
  safeSet(ls, SEEN_KEY, "1");
}

export function shownThisSession(): TipId[] {
  const raw = safeGet(ss, SESSION_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as TipId[]) : [];
  } catch {
    return [];
  }
}
export function markShown(id: TipId) {
  const next = Array.from(new Set([...shownThisSession(), id]));
  safeSet(ss, SESSION_KEY, JSON.stringify(next));
}

export function pickRandom(pool: TipId[], exclude?: TipId | null): TipId | null {
  const list = pool.filter((x) => x !== exclude);
  const src = list.length ? list : pool;
  if (!src.length) return null;
  return src[Math.floor(Math.random() * src.length)]!;
}

/** Random 5–10 giây. */
export function nextGap(): number {
  return 5000 + Math.floor(Math.random() * 5000);
}

/* ------------------------------- NEW badge ------------------------------- */

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Nội dung admin cấu hình cho icon có thay đổi so với lần user bấm gần nhất? */
export function isContentNew(id: TipId, content: unknown): boolean {
  const sig = hash(JSON.stringify(content ?? null));
  const prev = safeGet(ls, SIG_KEY + id);
  if (prev === null) {
    // Lần đầu biết icon này → ghi nhận, không làm phiền bằng badge.
    safeSet(ls, SIG_KEY + id, sig);
    return false;
  }
  return prev !== sig;
}

export function markContentSeen(id: TipId, content: unknown) {
  safeSet(ls, SIG_KEY + id, hash(JSON.stringify(content ?? null)));
}
