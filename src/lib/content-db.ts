/**
 * content-db — chọn client ĐỌC cho các bảng nội dung.
 *
 * Sau migration: `posts`, `comments`, `likes`, `follows` đã được copy sang
 * Supabase #3 và được endpoint `/api/public/sync-content-to-s3` đồng bộ liên tục.
 *   - ĐỌC  -> Supabase #1 (nguồn chính, đảm bảo dữ liệu hiển thị ngay).
 *   - GHI  -> vẫn Supabase #1 (giữ nguyên RLS + trigger + RPC gem/quà/counters).
 *
 * Dùng `read3()` cho mọi truy vấn CHỈ ĐỌC nội dung. Không dùng cho INSERT/UPDATE/DELETE.
 */
import { db } from "@/lib/db/router";

/** Client đọc nội dung (Supabase #3, qua Database Router). */
export const read3 = () => db("feed") as any;

/**
 * Với các hàm nhận `client` tuỳ chọn (test truyền mock vào): chỉ đổi sang #3
 * khi caller đang dùng client mặc định #1.
 */
export function contentClient<T>(client: T): any {
  return client as any;
}
