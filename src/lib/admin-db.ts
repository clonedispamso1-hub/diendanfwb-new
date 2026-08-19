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
import { cachedCall, invalidateRpcCache, TTL_LONG } from "@/lib/rpc-cache";

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

/**
 * Ghi một site setting — ĐƯỜNG GHI DUY NHẤT của toàn bộ website.
 *
 * Chỉ gọi RPC SECURITY DEFINER (save_admin_site_settings, fallback tên cũ
 * admin_set_site_setting). KHÔNG bao giờ ghi thẳng bảng → không còn lỗi RLS.
 * RPC tự INSERT nếu chưa có record, UPDATE nếu đã có.
 */
export async function adminSetSiteSetting(key: string, value: unknown): Promise<void> {
  const db = (await adminDb()) as any;
  const payload = { _key: key, _value: value as never };

  let { error } = await db.rpc("save_admin_site_settings", payload);

  // RPC mới chưa được tạo trong DB → dùng tên cũ.
  if (error && /save_admin_site_settings|does not exist|schema cache|PGRST202/i.test(String(error.message || error.code || ""))) {
    ({ error } = await db.rpc("admin_set_site_setting", payload));
  }

  if (error) {
    const msg = String(error.message || "");
    if (/FORBIDDEN|AUTH_REQUIRED|42501|row-level security/i.test(msg)) {
      throw new Error(
        "Phiên Admin đã hết hạn hoặc chưa đăng nhập đúng tài khoản Admin. Vui lòng đăng nhập lại Admin Panel rồi thử lại.",
      );
    }
    if (/does not exist|schema cache|PGRST202/i.test(msg)) {
      throw new Error(
        "Thiếu hàm save_admin_site_settings trong database. Hãy chạy file docs/sql/RUN_NOW_2026-08-13_site_settings_rpc_fix.sql trong Supabase SQL Editor.",
      );
    }
    throw error;
  }

  // Admin vừa ghi → bỏ cache đọc để mọi client lấy giá trị mới ở lần đọc kế tiếp.
  invalidateRpcCache(`site-setting:${key}`);
}


/**
 * Đọc một site setting (public read) — CÓ CACHE 10 phút.
 *
 * Trước đây mỗi component / mỗi lần đổi route đều gọi RPC `get_site_setting`
 * → DB bị spam. Nay dùng cache TTL + gộp request; truyền `force = true` khi
 * thực sự cần giá trị mới (ví dụ trong Admin Panel sau khi lưu).
 */
export async function getSiteSetting<T = any>(key: string, force = false): Promise<T | null> {
  return cachedCall<T | null>(
    `site-setting:${key}`,
    async () => {
      const { data } = await (supabase as any).rpc("get_site_setting", { _key: key });
      return (data as T) ?? null;
    },
    TTL_LONG,
    force,
  );
}
