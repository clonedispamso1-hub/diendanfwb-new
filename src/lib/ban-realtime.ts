/**
 * Ban Realtime — lắng nghe Supabase Realtime trên hàng profiles của CHÍNH
 * tài khoản đang đăng nhập. Khi Admin (máy khác) đặt ban_level = 3, event
 * UPDATE bắn về trong < 1 giây:
 *   1) xoá sạch session / localStorage / sessionStorage / cache
 *   2) đóng toàn bộ realtime channel
 *   3) window.location.replace("/blocked")
 *
 * Không polling. Fail-open: lỗi kênh realtime không ảnh hưởng app.
 */
import { supabase } from "@/lib/db/router";
import { invalidateGateCache, markDeviceBlocked } from "@/lib/access-guard";

/** KILL SWITCH: đã vô hiệu hóa — không xoá session, không ép sang /blocked. */
export async function purgeSessionAndBlock() {
  invalidateGateCache();
  markDeviceBlocked(); // no-op: chỉ dọn cờ cũ
}


/**
 * Bật kênh realtime cho 1 user. Trả về hàm huỷ đăng ký.
 */
export function watchBanRealtime(userId: string): () => void {
  if (typeof window === "undefined" || !userId) return () => {};

  const topic = `ban-watch:${userId}`;
  // Gỡ kênh cũ cùng tên (StrictMode mount 2 lần) để không .on() sau subscribe().
  try {
    supabase.getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => { void supabase.removeChannel(c); });
  } catch { /* ignore */ }

  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      (payload: any) => {
        const level = Number(payload?.new?.ban_level ?? payload?.new?.block_level ?? 0);
        const isAdmin = payload?.new?.is_admin === true;
        if (!isAdmin && level >= 3) void purgeSessionAndBlock();
      },
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
}
