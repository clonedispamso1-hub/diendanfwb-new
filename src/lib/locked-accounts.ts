/**
 * locked-accounts — nguồn sự thật CLIENT về tài khoản đang bị khóa.
 *
 * Vì sao cần file này: khi Bang Chủ khóa 1 tài khoản, dữ liệu trên DB đã đúng
 * (`profiles.is_banned = true`) nhưng UI vẫn có thể còn thấy bài viết cũ do các
 * lớp cache:
 *   - feed snapshot (localStorage, TTL 90s)
 *   - profile-cache (sessionStorage, TTL 5 phút)
 *   - profile bundle cache (in-memory, TTL 5 phút)
 *   - react-query cache của Feed / Hồ sơ / Tìm kiếm
 *
 * Module này giữ 1 danh sách id bị khóa ở phía client + dọn toàn bộ cache và
 * phát event `LOCK_CHANGE_EVENT` để cả 3 nhánh query (Home/Feed, Hồ sơ,
 * Tìm kiếm) ẩn bài NGAY, không phải chờ TTL.
 *
 * KHÔNG tạo bảng / RPC / SQL mới — chỉ xử lý ở tầng client.
 */
import { invalidateProfile, patchProfileCache } from "@/lib/profile-cache";
import { clearFeedSnapshots } from "@/lib/feed-snapshot";
import { invalidateCache } from "@/lib/request-cache";
import { isLockedAccount } from "@/lib/user-name";

export const LOCK_CHANGE_EVENT = "app:account-lock-changed";

export interface LockChangeDetail {
  userId: string;
  locked: boolean;
}

const SS_KEY = "lockedaccs:v1";

const locked = new Set<string>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    if (Array.isArray(arr)) arr.forEach((id) => id && locked.add(id));
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify([...locked]));
  } catch {
    /* quota — bỏ qua */
  }
}

/** Tài khoản này đang bị khóa (theo hiểu biết client hiện tại)? */
export function isLockedUserId(id: string | null | undefined): boolean {
  if (!id) return false;
  hydrate();
  return locked.has(id);
}

/** Danh sách id đang bị khóa — dùng cho filter batch. */
export function lockedUserIds(): Set<string> {
  hydrate();
  return new Set(locked);
}

/** Bài viết có bị ẩn không: dựa trên profile kèm theo HOẶC danh sách id khóa. */
export function isHiddenByLock(row: { user_id?: string | null; profiles?: unknown } | null | undefined): boolean {
  if (!row) return false;
  if (isLockedUserId(row.user_id ?? null)) return true;
  return isLockedAccount(row.profiles as any);
}

/** Lọc list bài viết: bỏ mọi bài của tài khoản đang bị khóa. */
export function filterLockedPosts<T extends { user_id?: string | null; profiles?: unknown }>(
  rows: T[] | null | undefined,
): T[] {
  if (!rows || rows.length === 0) return rows ?? [];
  return rows.filter((r) => !isHiddenByLock(r));
}

function purgeCaches(userId: string, isLocked: boolean) {
  // Profile cache: cập nhật cờ is_banned ngay để mọi chỗ đang render nhận đúng.
  try {
    patchProfileCache(userId, { is_banned: isLocked });
  } catch {
    /* ignore */
  }
  // Xoá hẳn entry để lần đọc kế tiếp lấy dữ liệu mới từ DB.
  try {
    invalidateProfile(userId);
  } catch {
    /* ignore */
  }
  // Snapshot trang đầu của Feed + các cache query chung (adminIds, pinned…).
  try {
    clearFeedSnapshots();
  } catch {
    /* ignore */
  }
  try {
    invalidateCache("feed");
  } catch {
    /* ignore */
  }
}

function emit(userId: string, isLocked: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<LockChangeDetail>(LOCK_CHANGE_EVENT, {
        detail: { userId, locked: isLocked },
      }),
    );
  } catch {
    /* SSR */
  }
}

/** Gọi NGAY sau khi khóa/purge thành công. */
export function markAccountLocked(userId: string) {
  if (!userId) return;
  hydrate();
  locked.add(userId);
  persist();
  purgeCaches(userId, true);
  emit(userId, true);
}

/** Gọi NGAY sau khi mở khóa / restore thành công. */
export function markAccountUnlocked(userId: string) {
  if (!userId) return;
  hydrate();
  locked.delete(userId);
  persist();
  purgeCaches(userId, false);
  emit(userId, false);
}

/** Đăng ký listener cho thay đổi khóa/mở khóa. Trả về hàm cleanup. */
export function onLockChange(handler: (detail: LockChangeDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const detail = (e as CustomEvent<LockChangeDetail>).detail;
    if (detail?.userId) handler(detail);
  };
  window.addEventListener(LOCK_CHANGE_EVENT, fn as EventListener);
  return () => window.removeEventListener(LOCK_CHANGE_EVENT, fn as EventListener);
}
