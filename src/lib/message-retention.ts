/* ============================================================
   MESSAGE SYSTEM V2 — tin nhắn tự hủy sau 72 giờ (3 ngày)
   ------------------------------------------------------------
   • Mọi truy vấn tin nhắn chỉ lấy dữ liệu trong 72 giờ gần nhất.
   • Đúng mỗi 72 giờ, dữ liệu chat (messages / notifications /
     reactions / trạng thái đã đọc) được reset — chu kỳ tính theo
     một mốc gốc cố định nên MỌI thiết bị đếm ngược giống nhau.
   • Không xoá: tài khoản, hồ sơ, bài viết, bình luận, like, follow,
     xu, VIP, cấu hình, danh sách người từng chat.
   • Server-side cron: xem docs/sql/RUN_NOW_2026-08-13_message_reset_72h.sql
     (client purge chỉ là fallback best-effort).
   ============================================================ */
import { supabase } from "@/lib/supabase";
import { db3 } from "@/lib/db/router";
import { chatDb } from "@/lib/chat-db";

/** notifications + message_reactions đã chuyển sang Supabase #3. */
const logs = () => db3() as any;

/** Thời gian sống của một tin nhắn: 72 giờ. */
export const MESSAGE_TTL_HOURS = 72;
export const MESSAGE_TTL_MS = MESSAGE_TTL_HOURS * 3_600_000;

/** Mốc gốc của chu kỳ reset (UTC) — cố định để mọi client đồng bộ. */
const CYCLE_ANCHOR_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Mốc ISO: tin nhắn cũ hơn mốc này coi như đã bị xoá. */
export function messageCutoffISO(now: number = Date.now()): string {
  return new Date(now - MESSAGE_TTL_MS).toISOString();
}

export function messageCutoffMs(now: number = Date.now()): number {
  return now - MESSAGE_TTL_MS;
}

/** Thời điểm reset toàn server tiếp theo (epoch ms). */
export function nextResetAt(now: number = Date.now()): number {
  const elapsed = now - CYCLE_ANCHOR_MS;
  const cycles = Math.floor(elapsed / MESSAGE_TTL_MS) + 1;
  return CYCLE_ANCHOR_MS + cycles * MESSAGE_TTL_MS;
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number; ms: number };

export function countdownTo(target: number, now: number = Date.now()): Countdown {
  const ms = Math.max(0, target - now);
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
    ms,
  };
}

/** "2 ngày 13 giờ 15 phút 28 giây" */
export function formatCountdown(c: Countdown, withSeconds = true): string {
  const parts = [`${c.days} ngày`, `${c.hours} giờ`, `${c.minutes} phút`];
  if (withSeconds) parts.push(`${c.seconds} giây`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Purge (best-effort, phía client)                                   */
/* ------------------------------------------------------------------ */
const THROTTLE_KEY = "chat.purge.v2";
const sb = supabase as any;

function throttled(key: string, windowMs: number): boolean {
  if (typeof window === "undefined") return true;
  try {
    const last = Number(window.localStorage.getItem(key) || 0);
    if (Date.now() - last < windowMs) return true;
    window.localStorage.setItem(key, String(Date.now()));
    return false;
  } catch {
    return false;
  }
}

/**
 * Xoá tin nhắn / thông báo quá 72 giờ của chính user hiện tại.
 * Chạy tối đa 1 lần / 6 giờ / thiết bị. Không bao giờ throw.
 */
export async function purgeExpiredChatData(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  if (throttled(`${THROTTLE_KEY}::${userId}`, 6 * 3_600_000)) return;
  const cutoff = messageCutoffISO();
  try {
    // RPC purge_expired_chat_data nằm trên Supabase #3 (nơi chứa public.messages).
    await chatDb().rpc("purge_expired_chat_data");
  } catch {
    /* RPC có thể chưa tồn tại — dùng fallback bên dưới */
  }
  try {
    await chatDb().from("messages").delete().eq("sender_id", userId).lt("created_at", cutoff);
    await chatDb().from("messages").delete().eq("receiver_id", userId).lt("created_at", cutoff);
    await logs().from("notifications").delete().eq("user_id", userId).lt("created_at", cutoff);
  } catch {
    /* im lặng — purge là best-effort, không chặn UI */
  }
}

/**
 * Admin: reset NGAY toàn bộ dữ liệu chat của cả server.
 * Ưu tiên RPC SECURITY DEFINER; nếu chưa có thì xoá trực tiếp (RLS áp dụng).
 * Giữ nguyên tài khoản, bạn bè, phòng chat, lịch sử người từng nhắn.
 */
export async function adminResetChatData(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.rpc("admin_reset_chat_data");
  if (!error) return { ok: true };

  const missing = /PGRST202|Could not find the function|does not exist|schema cache/i.test(
    `${error?.message ?? ""} ${error?.code ?? ""}`,
  );
  if (!missing) return { ok: false, error: error.message };

  try {
    const nowIso = new Date().toISOString();
    await supabase.from("message_reactions").delete().lt("created_at", nowIso);
    await chatDb().from("messages").delete().lt("created_at", nowIso);
    await logs().from("notifications").delete().lt("created_at", nowIso);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Không reset được" };
  }
}
