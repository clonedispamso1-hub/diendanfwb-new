// Phiên đăng nhập riêng của Bang Chủ — client do Database Router cấp phát
// (storageKey tách biệt session user). Cấu hình ở src/lib/db/config.ts.
import { supabaseAdminSession } from "@/lib/db/router";

export { supabaseAdminSession };

/** Email tổng hợp cho admin từ username — để tận dụng Supabase Auth password flow. */
export const adminEmailFromUsername = (username: string) =>
  `${username.trim().toLowerCase()}@admin.candy.local`;

/**
 * Các domain email từng được dùng để tạo tài khoản Auth cho Bang Chủ.
 * Một username có thể tồn tại nhiều auth user (đăng ký lại ở các phiên bản
 * khác nhau) → phải thử lần lượt và chỉ giữ phiên nào khớp `bangchu.auth_user_id`.
 * KHÔNG hard-code UID ở đây.
 */
export const ADMIN_EMAIL_DOMAINS = [
  "admin.candy.local",
  "candy.local",
  "bangchu.local",
  "admin.local",
  "app.local",
] as const;

/** Danh sách email ứng viên cho một username (hoặc chính email nếu người dùng nhập email). */
export function adminEmailCandidates(input: string): string[] {
  const raw = input.trim().toLowerCase();
  if (!raw) return [];
  if (raw.includes("@")) return [raw];
  return ADMIN_EMAIL_DOMAINS.map((d) => `${raw}@${d}`);
}


export type BangchuRole = "admin_1" | "admin_2" | "agent";
export type BangchuStatus = "pending" | "approved" | "rejected";

export interface BangchuRow {
  id: string;
  auth_user_id: string;
  username: string;
  role: BangchuRole;
  status: BangchuStatus;
  is_active: boolean;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

const BANGCHU_COLUMNS =
  "id, auth_user_id, username, role, status, is_active, created_at, approved_by, approved_at";

/**
 * Hồ sơ Bang Chủ của phiên Admin hiện tại.
 *
 * Cache ngắn (30s) THEO access_token + gộp các lần gọi đồng thời:
 * - Component quản trị bị mount lại (điều hướng, remount, nhiều nơi cùng gọi)
 *   không phát sinh lại GET /auth/v1/user + GET /rest/v1/bangchu mỗi lần.
 * - Token đổi (đăng nhập lại / refresh / đăng xuất) → khoá khác → đọc lại ngay.
 * - uid vẫn do Auth xác thực (dùng chung cache với cổng truy cập), bảng bangchu
 *   vẫn đọc thật qua RLS; chỉ lưu trong bộ nhớ, không lưu ra storage.
 * - Lỗi truy vấn không được cache.
 */
const BANGCHU_ROW_TTL_MS = 30_000;
let rowCache: { token: string; at: number; row: BangchuRow | null } | null = null;
let rowInflight: { token: string; p: Promise<BangchuRow | null> } | null = null;

export async function fetchCurrentBangchu(): Promise<BangchuRow | null> {
  const { data: sess } = await supabaseAdminSession.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return null;
  if (rowCache && rowCache.token === token && Date.now() - rowCache.at < BANGCHU_ROW_TTL_MS) {
    return rowCache.row;
  }
  if (rowInflight && rowInflight.token === token) return rowInflight.p;

  const p = (async () => {
    const { verifiedAdminUid } = await import("@/lib/access-guard");
    const uid = await verifiedAdminUid();
    if (!uid) return null;
    const { data, error } = await supabaseAdminSession
      .from("bangchu")
      .select(BANGCHU_COLUMNS)
      .eq("auth_user_id", uid)
      .maybeSingle();
    const row = (data as BangchuRow) ?? null;
    if (!error) rowCache = { token, at: Date.now(), row };
    return row;
  })();
  rowInflight = { token, p };
  try {
    return await p;
  } finally {
    if (rowInflight?.p === p) rowInflight = null;
  }
}

/** Xoá cache hồ sơ Bang Chủ (gọi khi đăng xuất / đổi tài khoản Admin). */
export function clearCurrentBangchuCache(): void {
  rowCache = null;
  rowInflight = null;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{6,30}$/;
export const PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u))
    return "Username 6-30 ký tự, chỉ chữ/số/_";
  return null;
}

export function validatePassword(p: string): string | null {
  if (!PASSWORD_RE.test(p))
    return "Password ≥10 ký tự, có chữ hoa, thường, số, ký tự đặc biệt";
  return null;
}
/** Hồ sơ Bang Chủ theo username (dùng để đối chiếu auth_user_id sau khi login). */
export async function fetchBangchuByUsername(username: string): Promise<BangchuRow | null> {
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const { data } = await supabaseAdminSession
    .from("bangchu")
    .select(BANGCHU_COLUMNS)
    .ilike("username", u)
    .maybeSingle();
  return (data as BangchuRow) ?? null;
}

/** UID + email THỰC TẾ của phiên Admin đang giữ (gọi server, không đọc cache). */
export async function describeAdminSession(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabaseAdminSession.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}
