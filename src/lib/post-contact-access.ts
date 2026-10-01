/**
 * Quyền dùng chức năng gắn link Facebook / Zalo trong "Tạo bài viết".
 *
 * KHÔNG tạo cơ chế quyền mới: dùng đúng các cờ sẵn có của hệ thống
 *  - Admin        : profiles.is_admin = true (hoặc profiles.role admin/super_admin/admin_1)
 *  - Clone Admin  : profiles.account_source = 'internal'  ← "Tài khoản thứ hai" của Admin Panel
 *    (xem src/lib/clone-account.ts, src/lib/vip-access.ts, docs/sql/2026-07-28_internal_accounts.sql)
 *
 * Thành viên thường: KHÔNG được dùng (ẩn nút ở UI + chặn ở tầng server).
 */

const ADMIN_ROLES = new Set(["admin", "super_admin", "admin_1", "moderator"]);

export interface ContactLinkProfileFlags {
  is_admin?: boolean | null;
  role?: string | null;
  account_source?: string | null;
}

/** Nguồn sự thật duy nhất để quyết định quyền Facebook/Zalo của một profile. */
export function canUseContactLinks(profile: unknown): boolean {
  const p = (profile ?? {}) as ContactLinkProfileFlags;
  if (p.is_admin === true) return true;
  if (p.role && ADMIN_ROLES.has(String(p.role).toLowerCase())) return true;
  // Tài khoản thứ hai / clone Admin được cấu hình trong Admin Panel.
  if (String(p.account_source ?? "") === "internal") return true;
  return false;
}

export const CONTACT_LINK_DENIED_MESSAGE =
  "Chức năng gắn link Facebook/Zalo chỉ dành cho Admin và tài khoản thứ hai của Admin.";
