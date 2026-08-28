/**
 * MEDIA VIP — module độc lập, viết lại sạch (2026-08).
 *
 * • CHỈ Admin Panel gán được (ghi qua adminSetSiteSetting — RPC site settings
 *   đã dùng cho mọi module admin khác, KHÔNG dùng admin_set_clone_vip_media).
 * • KHÔNG còn bất kỳ check "chỉ được gán cho tài khoản thứ hai/clone",
 *   không check bangchu/account_source/UID, không fallback session, không signOut.
 * • Lưu trong admin_site_settings key `vip_media_assign`:
 *     { [userId]: { name: string[] (≤2), avatar: string[] (≤10) } }
 *   → gán xong reload vẫn còn, không cần SQL / cột mới.
 * • Không đụng tới Kho GIF/Sticker thường, Cloudinary hay media khác.
 */
import { getSiteSetting, adminSetSiteSetting } from "@/lib/admin-db";

export const VIP_MEDIA_KEY = "vip_media_assign";

export const VIP_MEMBER_TITLE = "⭐ Thành viên VIP";
export const VIP_DURATIONS = ["8 tháng", "12 tháng", "24 tháng", "Vĩnh viễn"] as const;

export function randomVipDuration(): string {
  return VIP_DURATIONS[Math.floor(Math.random() * VIP_DURATIONS.length)];
}

/** GIF/Icon sau tên: tối đa 2. */
export const MAX_NAME_VIP_MEDIA = 2;
/** GIF/Sticker xung quanh avatar: tối đa 10. */
export const MAX_AVATAR_VIP_MEDIA = 10;

export type VipMediaSet = { name: string[]; avatar: string[] };
export type VipMediaAssign = Record<string, VipMediaSet>;

const EMPTY_SET: VipMediaSet = { name: [], avatar: [] };

const uniq = (list: unknown): string[] =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .filter((v): v is string => typeof v === "string" && !!v.trim())
        .map((v) => v.trim()),
    ),
  );

function normalizeSet(raw: any): VipMediaSet {
  if (Array.isArray(raw)) return { name: uniq(raw).slice(0, MAX_NAME_VIP_MEDIA), avatar: [] };
  return {
    name: uniq(raw?.name).slice(0, MAX_NAME_VIP_MEDIA),
    avatar: uniq(raw?.avatar).slice(0, MAX_AVATAR_VIP_MEDIA),
  };
}

function normalizeAssign(raw: any): VipMediaAssign {
  const out: VipMediaAssign = {};
  if (raw && typeof raw === "object") {
    for (const [id, val] of Object.entries(raw)) {
      const set = normalizeSet(val);
      if (set.name.length || set.avatar.length) out[id] = set;
    }
  }
  return out;
}

/* ------------------------------- store ------------------------------- */

let assign: VipMediaAssign | null = null;
let inflight: Promise<VipMediaAssign> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function subscribeCloneVipMedia(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Nạp toàn bộ bảng gán (1 request cho cả app, có cache). */
export function loadVipMediaAssign(force = false): Promise<VipMediaAssign> {
  if (!force && assign) return Promise.resolve(assign);
  if (!force && inflight) return inflight;
  inflight = getSiteSetting<any>(VIP_MEDIA_KEY, force)
    .then((raw) => {
      assign = normalizeAssign(raw);
      notify();
      return assign;
    })
    .catch(() => {
      assign = assign ?? {};
      return assign;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getCachedCloneVipMediaSet(userId: string): VipMediaSet | undefined {
  return assign ? assign[userId] ?? EMPTY_SET : undefined;
}

/**
 * Media sau tên (≤2).
 * QUAN TRỌNG: phải trả về CÙNG một reference giữa các lần gọi khi không có dữ
 * liệu, nếu không useSyncExternalStore sẽ re-render vô hạn (React #185).
 */
export function getCachedCloneVipMedia(userId: string): string[] | undefined {
  return assign ? (assign[userId]?.name ?? EMPTY_SET.name) : undefined;
}

/** Media quanh avatar (≤10). Cũng phải giữ reference ổn định. */
export function getCachedCloneVipAvatarMedia(userId: string): string[] | undefined {
  return assign ? (assign[userId]?.avatar ?? EMPTY_SET.avatar) : undefined;
}

/** Yêu cầu nạp (idempotent — chỉ 1 request cho toàn app). */
export function requestCloneVipMedia(userId?: string | null) {
  if (!userId || assign) return;
  void loadVipMediaAssign();
}

export function invalidateCloneVipMedia(_ids?: string[]) {
  assign = null;
  notify();
  void loadVipMediaAssign(true);
}

/** Tương thích với feed: chỉ cần nạp bảng gán 1 lần. */
export async function prefetchCloneVipMedia(_userIds?: Array<string | null | undefined>) {
  await loadVipMediaAssign();
}

/* ------------------------------ read/write ------------------------------ */

export async function fetchCloneVipMediaSet(userId: string): Promise<VipMediaSet> {
  const map = await loadVipMediaAssign(true);
  return map[userId] ?? EMPTY_SET;
}

export async function fetchCloneVipMedia(userId: string): Promise<string[]> {
  return (await fetchCloneVipMediaSet(userId)).name;
}

/**
 * Gán Media VIP cho 1 hoặc nhiều tài khoản (Admin Panel).
 * Trả về số tài khoản đã lưu. Không gate, không RPC clone-check.
 */
export async function setCloneVipMedia(
  ids: string[],
  input: string[] | VipMediaSet,
): Promise<number> {
  const targets = Array.from(new Set(ids.filter(Boolean)));
  if (!targets.length) return 0;

  const set = normalizeSet(input);
  const current = await loadVipMediaAssign(true);
  const next: VipMediaAssign = { ...current };
  for (const id of targets) {
    if (set.name.length || set.avatar.length) next[id] = set;
    else delete next[id];
  }

  await adminSetSiteSetting(VIP_MEDIA_KEY, next);
  assign = next;
  notify();
  return targets.length;
}

/** Random Media VIP cho từng tài khoản (mỗi tài khoản một bộ khác nhau). */
export async function randomizeCloneVipMedia(
  ids: string[],
  pool: string[],
  count: number,
  avatarPool: string[] = [],
  avatarCount = 0,
): Promise<number> {
  const targets = Array.from(new Set(ids.filter(Boolean)));
  if (!targets.length) return 0;
  if (!pool.length && !avatarPool.length) throw new Error("Kho Media VIP đang trống");

  const shuffle = (list: string[]) => {
    const bag = list.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  };
  const n = pool.length ? Math.max(1, Math.min(count || 1, pool.length, MAX_NAME_VIP_MEDIA)) : 0;
  const an = avatarPool.length
    ? Math.max(1, Math.min(avatarCount || avatarPool.length, avatarPool.length, MAX_AVATAR_VIP_MEDIA))
    : 0;

  const current = await loadVipMediaAssign(true);
  const next: VipMediaAssign = { ...current };
  for (const id of targets) {
    const set = normalizeSet({
      name: shuffle(pool).slice(0, n),
      avatar: shuffle(avatarPool).slice(0, an),
    });
    if (set.name.length || set.avatar.length) next[id] = set;
    else delete next[id];
  }
  await adminSetSiteSetting(VIP_MEDIA_KEY, next);
  assign = next;
  notify();
  return targets.length;
}
