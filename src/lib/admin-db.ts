/**
 * UNIFIED ADMIN AUTH — nguồn kiểm tra quyền / client ghi DUY NHẤT của Admin.
 *
 * Vấn đề trước đây: Admin Panel đăng nhập bằng client riêng
 * (`supabaseAdminSession`, storageKey "candy.admin.auth"), nhưng một số API
 * (ví dụ lưu Bong bóng nổi Facebook/Zalo) lại gọi RPC bằng client user thường
 * `supabase`. Server thấy auth.uid() là user thường → trả về:
 *   "FORBIDDEN: user ... is not an approved active admin"
 * dù người dùng đang ở trong Admin Panel.
 *
 * Từ nay MỌI thao tác đọc/ghi của Admin phải dùng `adminDb()` ở đây.
 * Không tự gọi `supabase` hay `supabaseAdminSession` trực tiếp trong module Admin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdminSession } from "@/integrations/supabase/admin-client";

/**
 * Trả về client Supabase đang thực sự có phiên Admin.
 * Ưu tiên phiên Admin Panel; fallback về phiên user thường (trường hợp
 * admin đăng nhập bằng cờ profiles.is_admin trên client chính).
 */
export async function adminDb(): Promise<SupabaseClient<any>> {
  const { data } = await supabaseAdminSession.auth.getSession();
  if (data.session) return supabaseAdminSession as unknown as SupabaseClient<any>;
  return supabase as unknown as SupabaseClient<any>;
}

/** Kiểm tra quyền admin — HÀM DUY NHẤT cho toàn bộ Admin Panel. */
export async function isAdminNow(): Promise<boolean> {
  const db = await adminDb();
  const { data: auth } = await db.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return false;

  // 1) Bang chủ (bảng bangchu: approved + active)
  const { data: bc } = await db
    .from("bangchu")
    .select("status,is_active")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (bc && (bc as any).status === "approved" && (bc as any).is_active) return true;

  // 2) Cờ profiles.is_admin
  const { data: pf } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", uid)
    .maybeSingle();
  return (pf as any)?.is_admin === true;
}

/** Ghi một site setting qua RPC bằng đúng phiên Admin. */
export async function adminSetSiteSetting(key: string, value: unknown): Promise<void> {
  const db = await adminDb();
  const { error } = await (db as any).rpc("admin_set_site_setting", {
    _key: key,
    _value: value,
  });
  if (error) {
    const msg = String(error.message || "");
    if (/FORBIDDEN|AUTH_REQUIRED|42501/i.test(msg)) {
      throw new Error(
        "Phiên Admin đã hết hạn hoặc chưa đăng nhập đúng tài khoản Admin. Vui lòng đăng nhập lại Admin Panel rồi thử lại.",
      );
    }
    throw error;
  }
}

/** Đọc một site setting (public read). */
export async function getSiteSetting<T = any>(key: string): Promise<T | null> {
  const { data } = await (supabase as any).rpc("get_site_setting", { _key: key });
  return (data as T) ?? null;
}
