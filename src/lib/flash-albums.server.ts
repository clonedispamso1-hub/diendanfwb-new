/**
 * ⚡ ALBUM ẢNH — helper máy chủ. Supabase #4 (ybzdpxwbpbkeqkqwbscp),
 * bảng flash_albums / flash_album_media, bucket `flash-albums`.
 * Service role key chỉ đọc trong hàm, không bao giờ gửi về trình duyệt.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const FLASH_SB4_URL = "https://ybzdpxwbpbkeqkqwbscp.supabase.co";
export const FLASH_BUCKET = "flash-albums";

export function flashAdminClient(): SupabaseClient<any> | null {
  const key = (process.env["SUPABASE4_SERVICE_ROLE_KEY"] || "").trim();
  if (!key) return null;
  return createClient<any>(FLASH_SB4_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export function randomAlbumCode(): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 3; i++) s += L[Math.floor(Math.random() * L.length)];
  return `${s}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
}

/** Xoá toàn bộ object dưới 1 thư mục trong bucket ⚡ (theo trang 1000). */
export async function removeFolder(sb: SupabaseClient<any>, prefix: string): Promise<number> {
  let removed = 0;
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await sb.storage.from(FLASH_BUCKET).list(prefix, { limit: 1000 });
    if (error || !data?.length) break;
    const paths = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (!paths.length) break;
    const r = await sb.storage.from(FLASH_BUCKET).remove(paths);
    if (r.error) throw r.error;
    removed += paths.length;
  }
  return removed;
}
