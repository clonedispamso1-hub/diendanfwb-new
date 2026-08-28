// src/lib/admin-slug.ts
// Slug bí mật để mount toàn bộ admin surface. Không hardcode "/admin" ở bất cứ đâu.
// Slug đọc từ ENV `VITE_ADMIN_SLUG` (khi build). Nếu trống → admin bị tắt hoàn toàn
// (mọi truy cập /admin hoặc slug bất kỳ đều trả 404 do không có route nào khớp).
//
// LƯU Ý BẢO MẬT:
// - Slug KHÔNG phải cơ chế xác thực. Backend RLS + `checkAdminAccess()` mới là gate thật.
// - Slug chỉ giúp ẩn admin surface khỏi crawlers / dò URL ngẫu nhiên.

// Nếu ENV chưa cấu hình → dùng slug mặc định "admin" để Admin Panel vẫn mount được
// (nếu không, mọi route admin sẽ 404 và Bang chủ không vào được "Quản lý thành viên").
const DEFAULT_SLUG = "admin";
const RAW =
  ((import.meta as any).env?.VITE_ADMIN_SLUG as string | undefined)?.trim() || DEFAULT_SLUG;
// Chỉ cho phép [a-zA-Z0-9_-] để tránh path injection.
const CLEAN = RAW.trim().replace(/^\/+/, "").replace(/[^A-Za-z0-9_\-]/g, "");

export const ADMIN_SLUG = CLEAN;
export const ADMIN_ENABLED = CLEAN.length > 0;

/** Trả về path admin theo slug, ví dụ adminPath("/login") → "/<slug>/login". Null nếu slug chưa set. */
export function adminPath(sub: string = ""): string | null {
  if (!ADMIN_ENABLED) return null;
  if (!sub) return `/${ADMIN_SLUG}`;
  const s = sub.startsWith("/") ? sub : `/${sub}`;
  return `/${ADMIN_SLUG}${s}`;
}

export function goAdmin(sub: string = ""): void {
  const p = adminPath(sub);
  if (!p || typeof window === "undefined") return;
  window.location.href = p;
}

/** Đường dẫn hiện tại có thuộc Admin Panel không? (dùng để KHÔNG redirect admin). */
export function isAdminPath(path?: string): boolean {
  if (!ADMIN_ENABLED) return false;
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "");
  return p === `/${ADMIN_SLUG}` || p.startsWith(`/${ADMIN_SLUG}/`);
}
