/**
 * user-name.ts — NGUỒN DUY NHẤT để lấy tên hiển thị của một tài khoản.
 *
 * Thứ tự ưu tiên (bắt buộc, áp dụng cho toàn hệ thống — Feed, Profile,
 * Comment, Chat, Notification, Admin):
 *   display_name → full_name → nickname → name → "Thành viên"
 *
 * TUYỆT ĐỐI KHÔNG dùng `username` để hiển thị: username chứa số điện thoại
 * của người dùng (dữ liệu nhạy cảm).
 *
 * KHÔNG cắt tên, KHÔNG thêm "...", KHÔNG hiển thị "Người dùng không hợp lệ".
 */

export const DEFAULT_USER_NAME = "Thành viên";

/** Tên hiển thị cho tài khoản đã bị khóa (Anti Clone mức 1/2/3) hoặc đã xóa. */
export const LOCKED_USER_NAME = "Tài khoản bị khóa";

/**
 * Hồ sơ này có đang bị khóa không? (dùng chung cho Comment / Message / Feed)
 * Chỉ dựa trên dữ liệu THẬT của chính hồ sơ đó — không suy diễn theo IP/thiết bị.
 */
export function isLockedAccount(source: NameLike | null | undefined): boolean {
  if (!source) return false;
  if ((source as any).is_admin === true) return false;
  const status = (source as any).account_status ?? (source as any).status;
  return (
    (source as any).is_banned === true ||
    (source as any).is_blocked === true ||
    Number((source as any).ban_level ?? 0) > 0 ||
    Number((source as any).block_level ?? 0) > 0 ||
    status === "banned" ||
    status === "suspended" ||
    status === "deleted"
  );
}

/** Độ dài tối đa của username (đồng bộ với ràng buộc DB). */
export const USERNAME_MAX_LENGTH = 25;

export interface NameLike {
  display_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  name?: string | null;
  nickname?: string | null;
  [key: string]: unknown;
}

/** Giá trị rác từ DB cũ (trigger lỗi, script SQL bị cắt...) → coi như rỗng. */
function isGarbage(value: string): boolean {
  if (!value) return true;
  if (/^[-=_.\s]+$/.test(value)) return true; // "-- =====", "___", "..."
  if (/^(null|undefined|nan)$/i.test(value)) return true;
  if (/không hợp lệ/i.test(value)) return true;
  return false;
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\s+/g, " ");
  return isGarbage(trimmed) ? "" : trimmed;
}

/** Chuỗi trông giống số điện thoại / username SĐT → không được hiển thị. */
function isPhoneLike(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 8 && digits.length / value.length > 0.7;
}

/** clean() + chặn dữ liệu nhạy cảm (SĐT) lọt ra UI. */
function safe(value: unknown): string {
  const v = clean(value);
  return v && !isPhoneLike(v) ? v : "";
}

/** Tên hiển thị chuẩn của user (không bao giờ rỗng). */
export function resolveUserName(
  source: NameLike | null | undefined,
  fallback: string = DEFAULT_USER_NAME,
): string {
  if (!source) return fallback;
  if (isLockedAccount(source)) return LOCKED_USER_NAME;
  return (
    safe(source.display_name) ||
    safe(source.full_name) ||
    safe(source.nickname) ||
    safe(source.name) ||
    fallback
  );
}

/**
 * Dạng rút gọn. Tham số `username` được giữ cho tương thích chữ ký cũ nhưng
 * KHÔNG bao giờ được hiển thị.
 */
export function pickName(
  displayName?: string | null,
  fullName?: string | null,
  _username?: string | null,
  fallback: string = DEFAULT_USER_NAME,
): string {
  return resolveUserName({ display_name: displayName, full_name: fullName }, fallback);
}

/**
 * Chuẩn hóa username khi đăng ký: bỏ khoảng trắng, ký tự lạ, giới hạn 25 ký tự.
 * Trả về chuỗi rỗng nếu không thể chuẩn hóa.
 */
export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.@-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

/** Kiểm tra username hợp lệ. Trả về thông báo lỗi hoặc null nếu hợp lệ. */
export function validateUsername(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return "Vui lòng nhập tên đăng nhập.";
  if (value.length > USERNAME_MAX_LENGTH) {
    return `Tên đăng nhập tối đa ${USERNAME_MAX_LENGTH} ký tự (hiện tại ${value.length}).`;
  }
  if (value.length < 3) return "Tên đăng nhập phải có ít nhất 3 ký tự.";
  return null;
}

/**
 * Bộ tên hợp lệ để ghi vào `profiles` khi đăng ký:
 * username / display_name / full_name luôn khác null và khác rỗng.
 */
export function buildSignupNames(input: {
  username?: string | null;
  phone?: string | null;
  fullName?: string | null;
  userId?: string | null;
}): { username: string; display_name: string; full_name: string } {
  const username =
    normalizeUsername(input.username) ||
    normalizeUsername(input.phone) ||
    `user_${(input.userId ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12)}`;
  const display = clean(input.fullName) || username;
  return {
    username: username.slice(0, USERNAME_MAX_LENGTH),
    display_name: display,
    full_name: display,
  };
}
