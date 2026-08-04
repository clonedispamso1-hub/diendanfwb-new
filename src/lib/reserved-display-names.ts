/**
 * Danh sách tên hiển thị bị cấm (chống giả mạo quản trị viên).
 * So khớp không phân biệt hoa/thường, bỏ dấu cách, bỏ ký tự đặc biệt.
 */
const RESERVED_DISPLAY_NAMES = [
  "Admin",
  "ADMIN",
  "admin",
  "Administrator",
  "Moderators",
  "Moderator",
  "Quản trị viên",
  "Quản Trị",
  "Support",
  "CSKH",
  "Chăm Sóc Khách Hàng",
  "Hỗ Trợ",
  "System",
  "Official",
  "Diễn Đàn FWB",
  "BQT",
];

/** Chuẩn hoá: trim, lowercase, bỏ toàn bộ khoảng trắng và ký tự không phải chữ/số. */
export function normalizeDisplayName(raw: string): string {
  return (raw ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s\u00A0._\-*|/\\]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const RESERVED_SET = new Set(RESERVED_DISPLAY_NAMES.map(normalizeDisplayName));

export const RESERVED_DISPLAY_NAME_MESSAGE = "Tên hiển thị này không được phép sử dụng.";

/** true nếu tên hiển thị nằm trong danh sách cấm. */
export function isReservedDisplayName(raw: string): boolean {
  const key = normalizeDisplayName(raw);
  if (!key) return false;
  return RESERVED_SET.has(key);
}
