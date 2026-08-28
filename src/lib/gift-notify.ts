/**
 * 🔔 THÔNG BÁO QUÀ — MỘT ĐƯỜNG DUY NHẤT CHO CẢ WEBSITE.
 *
 * Dùng cho quà của user thường (src/lib/gift-send.ts) VÀ quà của clone
 * (src/lib/admin/clone-gift.ts): cùng RPC `notify_post_gift_v5` trên
 * Supabase #3 (SECURITY DEFINER, idempotent theo `gift_id` → retry không tạo
 * thông báo trùng).
 *
 * ⚠️ KHÔNG insert trực tiếp vào `public.notifications` (policy RESTRICTIVE
 * chặn client) và KHÔNG dùng RPC notification cũ.
 *
 * Lỗi ở bước này không bao giờ được ảnh hưởng tới ví/Xu: chỉ trả về
 * { ok:false, error } để nơi gọi log lại.
 */
import { db3 } from "@/lib/db/router";

const s3 = () => db3() as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asUuid = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return UUID_RE.test(s) ? s : null;
};

export interface GiftNotifyInput {
  /** post_gifts.id trả về từ RPC tài chính trên Supabase #1 — khoá idempotency. */
  giftId?: string | null;
  receiverId: string;
  senderId?: string | null;
  senderName?: string | null;
  postId?: string | null;
  giftKey: string;
  giftName?: string | null;
  giftEmoji?: string | null;
  effect?: string | null;
  amount: number;
}

export interface GiftNotifyResult {
  ok: boolean;
  notificationId?: string | null;
  error?: string;
}

export async function notifyPostGiftSb3(input: GiftNotifyInput): Promise<GiftNotifyResult> {
  const giftId = asUuid(input.giftId);
  const receiverId = asUuid(input.receiverId);
  if (!giftId) return { ok: false, error: "gift_id_invalid" };
  if (!receiverId) return { ok: false, error: "receiver_invalid" };

  const emoji = input.giftEmoji || "🎁";
  const giftName = input.giftName || "món quà";
  const amount = Number(input.amount || 0);
  const title = `${emoji} ${input.senderName || "Ai đó"} đã tặng bạn một ${giftName}.`;
  const message = `Giá trị ${amount.toLocaleString("vi-VN")} xu. Bấm Nhận để cộng vào ví.`;

  try {
    const { data, error } = await s3().rpc("notify_post_gift_v5", {
      p_gift_id: giftId,
      p_receiver_id: receiverId,
      p_actor_id: asUuid(input.senderId),
      p_post_id: asUuid(input.postId),
      p_gift_key: input.giftKey,
      p_amount: amount,
      p_title: title,
      p_message: message,
      p_data: {
        gift_name: giftName,
        emoji,
        effect: input.effect ?? null,
        sender_name: input.senderName ?? null,
      },
    });
    if (error) {
      // KHÔNG nuốt lỗi: log nguyên văn để soi RLS/quyền EXECUTE.
      console.error("[GiftNotify] notify_post_gift_v5 error ←", {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
      });
      return {
        ok: false,
        error: `code: ${(error as any).code}\nmessage: ${error.message}\ndetails: ${(error as any).details}\nhint: ${(error as any).hint}`,
      };
    }
    const res: any = Array.isArray(data) ? data[0] : data;
    if (res && res.ok === false) {
      console.error("[GiftNotify] notify_post_gift_v5 trả về ok=false ←", res);
      return { ok: false, error: String(res.code ?? "notify_failed") };
    }
    console.info("[GiftNotify] notify_post_gift_v5 ok ←", res);
    return { ok: true, notificationId: res?.notification_id ? String(res.notification_id) : null };
  } catch (e: any) {
    console.error("[GiftNotify] exception", e);
    return { ok: false, error: e?.message || "notification_failed" };
  }
}
