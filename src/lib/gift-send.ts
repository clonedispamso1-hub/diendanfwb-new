/**
 * 🎁 Luồng gửi quà — CHỈ dùng RPC `send_post_gift_v2` trên Supabase #1.
 *
 * Bước 1 — lấy `user_id` (chủ bài viết) từ Supabase #3 (nguồn của `posts`),
 *          hoặc dùng `receiverId` mà UI đã biết.
 * Bước 2 — gọi `send_post_gift_v2(p_post_id, p_receiver_id, p_gift_key, p_amount)`
 *          trên Supabase #1. KHÔNG còn fallback về RPC v1 cũ.
 */
import { getInstanceClient, db3 } from "@/lib/db/router";

/** Supabase #1 (core/auth/ví) — nơi chứa `send_post_gift_v2`. */
const db1 = () => getInstanceClient("primary") as any;

export interface SendGiftInput {
  postId: string;
  giftKey: string;
  amount: number;
  /** Chủ bài viết (nếu UI đã biết) — vẫn được xác thực lại ở Supabase #3. */
  receiverId?: string | null;
}

export interface SendGiftResult {
  ok: boolean;
  code?: string;
  message?: string;
  gift_id?: string;
  notif_id?: string;
  new_balance?: number;
  total_gifted?: number;
  emoji?: string;
  effect?: string;
  /** RPC báo cần app tự chèn notification sang Supabase #3. */
  needs_notification?: boolean;
  receiver_id?: string;
  sender_id?: string;
  sender_name?: string;
  gift_key?: string;
  gift_name?: string;
  amount?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return UUID_RE.test(s) ? s : null;
};

/**
 * Lấy chủ bài viết. Ưu tiên Supabase #3 (nguồn hiện tại của `posts`),
 * fallback về `receiverId` do UI truyền xuống.
 */
export async function resolvePostOwner(
  postId: string,
  fallbackReceiverId?: string | null,
): Promise<{ ownerId: string | null; found: boolean }> {
  const fallback = asUuid(fallbackReceiverId);
  if (!asUuid(postId)) return { ownerId: fallback, found: Boolean(fallback) };

  try {
    const { data, error } = await db3()
      .from("posts")
      .select("id, user_id")
      .eq("id", postId)
      .maybeSingle();
    if (!error && (data as any)?.id) {
      const owner = asUuid((data as any).user_id) ?? fallback;
      return { ownerId: owner, found: Boolean(owner) };
    }
  } catch {
    /* bỏ qua, dùng fallback */
  }

  // Không đọc được (RLS / lỗi mạng) nhưng UI đã biết chủ bài viết → vẫn cho gửi.
  return { ownerId: fallback, found: Boolean(fallback) };
}

/** Trừ Xu/Gem + tạo quà + notification trên Supabase #1 (chỉ RPC v2). */
export async function sendPostGift(input: SendGiftInput): Promise<SendGiftResult> {
  const postId = asUuid(input.postId);
  if (!postId) {
    return { ok: false, code: "POST_INVALID", message: "Bài viết không hợp lệ." };
  }

  const { ownerId } = await resolvePostOwner(postId, input.receiverId);
  const receiverId = asUuid(ownerId);
  if (!receiverId) {
    return {
      ok: false,
      code: "RECEIVER_NOT_FOUND",
      message: "Không xác định được chủ bài viết.",
    };
  }

  const { data, error } = await db1().rpc("send_post_gift_v2", {
    p_post_id: postId,
    p_receiver_id: receiverId,
    p_gift_key: input.giftKey,
    p_amount: input.amount,
  });

  if (error) {
    return { ok: false, message: error.message || "Không gửi được quà." };
  }

  const raw = (data as any) ?? null;
  if (!raw) return { ok: false, message: "Không gửi được quà." };

  // RPC v2 mới trả về { success, message, ... }; bản cũ trả { ok, ... }.
  const res: SendGiftResult = {
    ...raw,
    ok: raw.ok ?? raw.success ?? false,
    new_balance: raw.new_balance ?? raw.balance ?? raw.sender_balance,
  };
  if (!res.ok) {
    return { ok: false, code: raw.code, message: raw.message || "Không gửi được quà." };
  }

  // Nối luồng notification sang Supabase #3 — CHỈ sau khi RPC tài chính SB1 OK.
  if (res.ok && (res.needs_notification || !res.notif_id)) {
    const notifId = await notifyPostGiftSB3({
      giftId: res.gift_id,
      receiverId: res.receiver_id ?? receiverId,
      actorId: res.sender_id ?? null,
      postId,
      giftKey: res.gift_key ?? input.giftKey,
      giftName: res.gift_name,
      emoji: res.emoji,
      effect: res.effect,
      amount: Number(res.amount ?? input.amount) || 0,
      senderName: res.sender_name,
    });
    if (notifId) res.notif_id = notifId;
  }

  return res;
}

/**
 * Ghi notification quà vào Supabase #3 qua RPC `notify_post_gift_v5`
 * (SECURITY DEFINER, idempotent theo gift_id → retry không tạo bản trùng).
 *
 * Lỗi ở bước này KHÔNG được ảnh hưởng tới ví/Xu/Gem: chỉ log nội bộ, không
 * hiển thị lỗi DB thô cho người dùng, không rollback bất cứ thứ gì.
 */
async function notifyPostGiftSB3(p: {
  giftId?: string | null;
  receiverId: string;
  actorId?: string | null;
  postId: string;
  giftKey: string;
  giftName?: string;
  emoji?: string;
  effect?: string;
  amount: number;
  senderName?: string;
}): Promise<string | null> {
  const giftId = asUuid(p.giftId);
  const receiverId = asUuid(p.receiverId);
  if (!giftId || !receiverId) return null;

  const title = `${p.emoji ?? "🎁"} ${p.senderName ?? "Ai đó"} đã tặng bạn một ${p.giftName ?? "món quà"}.`;
  const message = `Giá trị ${p.amount.toLocaleString("vi-VN")} xu. Bấm Nhận để cộng vào ví.`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await db3().rpc("notify_post_gift_v5", {
        p_gift_id: giftId,
        p_receiver_id: receiverId,
        p_actor_id: asUuid(p.actorId),
        p_post_id: asUuid(p.postId),
        p_gift_key: p.giftKey,
        p_amount: p.amount,
        p_title: title,
        p_message: message,
        p_data: {
          gift_name: p.giftName,
          emoji: p.emoji,
          effect: p.effect,
        },
      });
      if (!error) {
        const res: any = Array.isArray(data) ? data[0] : data;
        return res?.notification_id ? String(res.notification_id) : null;
      }
      console.warn("[gift-notify] SB3 RPC lỗi", error.message);
    } catch (err) {
      console.warn("[gift-notify] SB3 RPC ngoại lệ", err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}
