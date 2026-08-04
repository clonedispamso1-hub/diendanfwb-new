/**
 * Supabase #2 — Database phụ (Live Móc 🦋 + Cộng Đồng VIP).
 *
 * Tách khỏi DB chính để giảm tải: DB chính chỉ giữ thành viên, hồ sơ, feed,
 * tin nhắn, bình luận, follow, thông báo.
 *
 * Client này KHÔNG lưu session (không auth), chỉ đọc/ghi dữ liệu nội dung.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;

const URL2 = (env["VITE_MEDIA_SUPABASE_URL"] ?? "").replace(/\/+$/, "");
const KEY2 = env["VITE_MEDIA_SUPABASE_ANON_KEY"] ?? "";

export const isSecondaryConfigured = Boolean(URL2 && KEY2);

let client: SupabaseClient<any> | null = null;

/** Lazy singleton — không tạo client nếu chưa dùng tới (không làm nặng bundle khởi động). */
export function db2(): SupabaseClient<any> {
  if (!client) {
    client = createClient<any>(URL2 || "https://invalid.supabase.co", KEY2 || "public-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  }
  return client;
}
