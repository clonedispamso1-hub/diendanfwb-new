/**
 * Thông báo "đã chuyển Xu/Gem cho bạn" — INSERT vào Supabase #3.
 *
 * QUY TẮC BẮT BUỘC: chỉ được gọi SAU KHI RPC tài chính trên Supabase #1
 * (ví dụ `secure_transfer_gem`) đã trả về thành công. Không có trigger nào
 * của SB1 được ghi thẳng sang SB3.
 *
 * Không đụng vào logic ví/Gem/Gift: hàm này chỉ ghi 1 dòng notification và
 * luôn nuốt lỗi (giao dịch đã thành công, không được rollback vì notify).
 */
import { db3 } from "@/lib/db/router";

export interface TransferNotifyInput {
  receiverId: string;
  senderId: string;
  senderName?: string | null;
  amount: number;
  currency?: "xu" | "gem";
  /** id giao dịch từ RPC — dùng để chống trùng thông báo. */
  transferId?: string | null;
}

export async function notifyTransferReceived(input: TransferNotifyInput): Promise<void> {
  const { receiverId, senderId, amount } = input;
  if (!receiverId || !senderId || receiverId === senderId) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  const label = input.currency === "gem" ? "Gem" : "xu";
  const who = input.senderName?.trim() || "Một người chơi";

  try {
    await db3()
      .from("notifications")
      .insert({
        user_id: receiverId,
        type: "wallet_transfer",
        kind: "wallet_transfer",
        title: `${who} đã chuyển cho bạn ${Number(amount).toLocaleString("vi-VN")} ${label}`,
        message: "Số dư của bạn đã được cộng.",
        last_actor_id: senderId,
        data: {
          kind: "wallet_transfer",
          amount,
          currency: input.currency ?? "xu",
          sender_id: senderId,
          from_user_id: senderId,
          transfer_id: input.transferId ?? null,
        },
        is_read: false,
        // Chuyển tiền KHÔNG cần Claim → không tính vào badge Gift pending.
        is_pending_claim: false,
      });
  } catch {
    /* giao dịch đã thành công — bỏ qua lỗi thông báo */
  }
}
