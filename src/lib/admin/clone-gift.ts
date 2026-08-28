/**
 * 🎁 CLONE TẶNG QUÀ — MODULE DUY NHẤT.
 *
 * Chỉ đúng 1 RPC trên Supabase #1: `admin_clone_gift_post_v6` (ATOMIC).
 *   • Clone → USER THẬT: trừ Xu clone + `post_gifts` claimed=false (Xu treo)
 *     ⇒ app ghi notification sang SB3; user bấm "Nhận" mới cộng Xu + hiệu ứng.
 *   • Clone → CLONE: trừ/cộng Xu ngay, claimed=true, KHÔNG notification.
 *
 * TUYỆT ĐỐI KHÔNG: `send_post_gift_v2`, `gem_transactions` (không còn from_id),
 * không fallback sang các RPC cũ (v3/v4/v5) vì chúng ghi gem_transactions.
 *
 * Giá quà LUÔN do app truyền vào, lấy từ `src/lib/gift-prices.ts`.
 */
import { getInstanceClient } from "@/lib/db/router";
import { SUPABASE_INSTANCES } from "@/lib/db/config";
import { notifyPostGiftSb3 } from "@/lib/gift-notify";

const db1 = () => getInstanceClient("primary") as any;
const RPC_NAME = "admin_clone_gift_post_v6";


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return UUID_RE.test(s) ? s : null;
};

export interface CloneGiftInput {
  cloneId: string;
  postId: string;
  receiverId: string;
  giftKey: string;
  amount: number;
  /** Khoá chống trùng — BẮT BUỘC, ổn định theo lượt tặng để retry an toàn. */
  idemKey: string;
  /** Tên/emoji quà để hiển thị trong thông báo của người nhận (tuỳ chọn). */
  giftName?: string | null;
  giftEmoji?: string | null;
  effect?: string | null;
}

export interface CloneGiftResult {
  ok: boolean;
  /** true = lượt này đã gửi trước đó (retry) — KHÔNG trừ/cộng Xu lần 2. */
  duplicate?: boolean;
  giftId?: string | null;
  newBalance?: number | null;
  receiverBalance?: number | null;
  senderName?: string | null;
  code?: string;
  message?: string;
  /** true = người nhận là user thật ⇒ Xu treo, chờ bấm "Nhận". */
  pending?: boolean;
  notificationId?: string | null;
}

export async function sendCloneGift(input: CloneGiftInput): Promise<CloneGiftResult> {
  const cloneId = asUuid(input.cloneId);
  const postId = asUuid(input.postId);
  const receiverId = asUuid(input.receiverId);
  const amount = Number(input.amount);

  if (!cloneId) return { ok: false, code: "CLONE_INVALID", message: "Tài khoản gửi không hợp lệ." };
  if (!postId) return { ok: false, code: "POST_INVALID", message: "Bài viết không hợp lệ." };
  if (!receiverId)
    return { ok: false, code: "RECEIVER_NOT_FOUND", message: "Không xác định được chủ bài viết." };
  if (!input.giftKey) return { ok: false, code: "GIFT_INVALID", message: "Chưa chọn quà." };
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return { ok: false, code: "AMOUNT_INVALID", message: "Giá quà phải là số nguyên dương hợp lệ." };
  if (!input.idemKey) return { ok: false, code: "IDEM_REQUIRED", message: "Thiếu khoá chống trùng." };

  const params = {
    p_account: cloneId,
    p_post_id: postId,
    p_receiver_id: receiverId,
    p_gift_key: input.giftKey,
    p_amount: amount,
    p_idem: input.idemKey,
  };
  console.info("[GiftV6] RPC request →", {
    supabaseUrl: SUPABASE_INSTANCES.primary.url,
    rpc: RPC_NAME,
    params,
  });
  const { data, error } = await db1().rpc(RPC_NAME, params);
  console.info("[GiftV6] RPC response ←", { data, error });


  if (error) {
    const code = String(error.code ?? "");
    const message = String(error.message ?? "");
    const details = String(error.details ?? "");
    const hint = String(error.hint ?? "");
    return {
      ok: false,
      code,
      message: `code: ${code}\nmessage: ${message}\ndetails: ${details}\nhint: ${hint}`,
    };
  }

  const raw = (data as any) ?? null;
  if (!raw || raw.ok === false) {
    return {
      ok: false,
      code: raw?.code ?? "GIFT_FAILED",
      message: raw?.message ?? "Không gửi được quà.",
    };
  }

  const giftId = asUuid(raw.gift_id);
  if (raw.duplicate) {
    return { ok: true, duplicate: true, giftId, senderName: raw.sender_name ?? null };
  }
  if (!giftId) {
    return { ok: false, code: "GIFT_MISSING", message: "Không tạo được bản ghi quà — đã hoàn tác." };
  }

  const senderName = raw.sender_name ?? null;
  // Mặc định PHẢI thông báo, trừ khi RPC nói rõ người nhận là clone.
  const needsNotification =
    raw.needs_notification === true ||
    raw.receiver_is_clone === false ||
    (raw.needs_notification == null && raw.receiver_is_clone == null);

  // Người nhận là USER THẬT ⇒ Xu đang treo, phải có thông báo trong chuông để
  // họ bấm "Nhận" (lúc đó claim_post_gift_v2 mới cộng Xu + chạy hiệu ứng).
  // Clone → clone: RPC đã cộng thẳng, KHÔNG tạo notification.
  let notificationId: string | null = null;
  if (needsNotification) {
    const notif = await notifyPostGiftSb3({
      giftId,
      receiverId,
      senderId: cloneId,
      senderName,
      postId,
      giftKey: input.giftKey,
      giftName: input.giftName ?? null,
      giftEmoji: input.giftEmoji ?? null,
      effect: input.effect ?? null,
      amount,
    });
    if (!notif.ok) console.error("[GiftV6] notification SB3 THẤT BẠI (nguyên văn):", notif.error);
    notificationId = notif.notificationId ?? null;
  }

  return {
    ok: true,
    giftId,
    pending: needsNotification,
    notificationId,
    newBalance: raw.new_balance != null ? Number(raw.new_balance) : null,
    receiverBalance: raw.receiver_balance != null ? Number(raw.receiver_balance) : null,
    senderName,
  };
}
