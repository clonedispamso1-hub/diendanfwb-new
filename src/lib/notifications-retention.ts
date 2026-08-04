/* ============================================================
   Notification retention — 7 ngày
   ------------------------------------------------------------
   • Mọi truy vấn notification chỉ lấy dữ liệu trong 7 ngày gần nhất
     → index scan hẹp, query nhanh, payload nhỏ.
   • Dọn dẹp: chạy tối đa 1 lần / ngày / thiết bị (throttle bằng
     localStorage), chỉ xoá notification của chính người dùng nên
     không ảnh hưởng dữ liệu khác.
   • Nếu bạn bật pg_cron trên Supabase, xem docs/notifications-retention.sql
     để dọn phía server (khuyến nghị) — client cleanup khi đó chỉ là fallback.
   ============================================================ */
import { supabase } from "@/lib/supabase";

export const NOTIFICATION_TTL_DAYS = 7;

/** Mốc thời gian ISO của giới hạn 7 ngày. */
export function notificationCutoffISO(): string {
  return new Date(Date.now() - NOTIFICATION_TTL_DAYS * 86_400_000).toISOString();
}

const THROTTLE_KEY = "notif.purge.v1";

/** Xoá notification quá 7 ngày của chính user. Tối đa 1 lần/ngày/thiết bị. */
export async function purgeOldNotifications(userId: string | null | undefined): Promise<void> {
  if (!userId || typeof window === "undefined") return;
  try {
    const last = Number(window.localStorage.getItem(`${THROTTLE_KEY}::${userId}`) || 0);
    if (Date.now() - last < 86_400_000) return;
    window.localStorage.setItem(`${THROTTLE_KEY}::${userId}`, String(Date.now()));
  } catch {
    /* localStorage bị chặn — vẫn chạy 1 lần */
  }
  try {
    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", notificationCutoffISO());
  } catch {
    /* im lặng — dọn dẹp là best-effort, không được chặn UI */
  }
}
