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
import { supabase } from "@/integrations/supabase/client";
import { invalidateGateCache, markDeviceBlocked } from "@/lib/access-guard";

/** Xoá sạch mọi dấu vết phiên đăng nhập rồi ép sang /blocked. */
export async function purgeSessionAndBlock() {
  if (typeof window === "undefined") return;
  invalidateGateCache();

  // 1) Đóng realtime trước để không còn event nào chạy nữa.
  try { await supabase.removeAllChannels(); } catch { /* ignore */ }
  try { supabase.realtime.disconnect(); } catch { /* ignore */ }

  // 2) Xoá session + toàn bộ storage.
  try { await supabase.auth.signOut({ scope: "local" } as any); } catch { /* ignore */ }
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }

  // 3) Đánh dấu thiết bị bị khóa (đặt SAU khi đã xoá sạch storage) rồi sang
  //    trang 404 giả. Cờ này giúp /blocked không bao giờ tự nhảy về đăng nhập.
  markDeviceBlocked();
  if (window.location.pathname !== "/blocked") window.location.replace("/blocked");
}

/**
 * Bật kênh realtime cho 1 user. Trả về hàm huỷ đăng ký.
 */
export function watchBanRealtime(userId: string): () => void {
  if (typeof window === "undefined" || !userId) return () => {};

  const channel = supabase
    .channel(`ban-watch:${userId}`)
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
