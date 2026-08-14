/**
 * Popup Gate (UI/UX V4) — quyết định THỜI ĐIỂM hiện popup "Theo dõi Fanpage".
 *
 * Quy tắc:
 *  - KHÔNG hiện ngay sau khi Đăng ký → đánh dấu "skip" cho tài khoản vừa tạo.
 *  - CHỈ hiện sau khi Đăng nhập (lần đầu vào tài khoản đã có).
 *  - Mỗi tài khoản chỉ hiện 1 lần: người dùng đóng / "Để sau" / hoàn thành → không hiện lại.
 *
 * Chỉ dùng localStorage phía client. KHÔNG chạm database / RPC / auth flow.
 */
const SKIP_PREFIX = "site.followPopup.skipAfterRegister:";
const DONE_PREFIX = "site.followPopup.seen:";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function del(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Gọi ngay sau khi ĐĂNG KÝ thành công → chặn popup ở lần vào đầu tiên. */
export function markFollowPopupSkipAfterRegister(userId: string) {
  if (!userId) return;
  set(SKIP_PREFIX + userId, "register");
}

/**
 * Gọi sau khi ĐĂNG NHẬP thành công.
 * - Vừa đăng ký → lần đăng nhập đầu tiên vẫn bị chặn.
 * - Từ lần đăng nhập tiếp theo → mở khoá popup (nếu chưa từng xem).
 */
export function clearFollowPopupRegisterSkip(userId: string) {
  if (!userId) return;
  const state = get(SKIP_PREFIX + userId);
  if (state === "register") {
    set(SKIP_PREFIX + userId, "first-login");
    return;
  }
  del(SKIP_PREFIX + userId);
}


/** Đánh dấu tài khoản đã xem popup → không bao giờ hiện lại. */
export function markFollowPopupSeen(userId: string) {
  if (!userId) return;
  set(DONE_PREFIX + userId, "1");
}

/** true = KHÔNG được hiện popup cho tài khoản này. */
export function isFollowPopupSuppressed(userId: string): boolean {
  if (!userId) return true;
  return Boolean(get(SKIP_PREFIX + userId)) || get(DONE_PREFIX + userId) === "1";
}

