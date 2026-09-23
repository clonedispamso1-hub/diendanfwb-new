/**
 * ping-actions — trạng thái Ping lưu ở Supabase (bảng `profile_pings` trên
 * database chat), KHÔNG dùng localStorage.
 *
 * Quy tắc: cùng một chiều sender → receiver chỉ Ping được 1 lần. Ràng buộc
 * PRIMARY KEY (sender_id, receiver_id) chặn trùng ở tầng database; client chỉ
 * kiểm tra trước để hiển thị UI.
 *
 * Hiệu năng: chỉ query đúng 1 cặp đang mở (head count), cache bằng React Query,
 * không polling, không tải lịch sử Ping.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { chatDb } from "@/lib/chat-db";

const TABLE = "profile_pings";

export const pingStatusKey = (senderId: string | null, receiverId: string | null) =>
  ["ping-status", senderId ?? "", receiverId ?? ""] as const;

/** Đã Ping người này chưa? (1 query nhẹ, chỉ đếm, không lấy dữ liệu) */
export async function hasPinged(senderId: string, receiverId: string): Promise<boolean> {
  const { count, error } = await chatDb()
    .from(TABLE)
    .select("sender_id", { count: "exact", head: true })
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export type PingResult = "ok" | "already" | "error";

/**
 * Hệ thống tự tạo Profile Card của B gửi cho A sau khi A Ping B.
 * Bản ghi tin nhắn dùng đúng schema chat hiện có (sender_id = B, receiver_id = A)
 * nên UI hiển thị y hệt như B tự gửi card — không có loại message mới.
 */
export async function sendProfileCardFrom(fromUserId: string, toUserId: string): Promise<boolean> {
  const { profileCardToken } = await import("@/lib/profile-share");
  const { error } = await chatDb()
    .from("messages")
    .insert([
      {
        sender_id: fromUserId,
        receiver_id: toUserId,
        content: profileCardToken(fromUserId),
        is_read: false,
      },
    ]);
  return !error;
}

/** Ghi nhận Ping. Trả "already" khi database từ chối vì đã Ping trước đó. */
export async function recordPing(senderId: string, receiverId: string): Promise<PingResult> {
  if (!senderId || !receiverId || senderId === receiverId) return "error";
  const { error } = await chatDb()
    .from(TABLE)
    .insert({ sender_id: senderId, receiver_id: receiverId });
  if (!error) return "ok";
  // 23505 = unique_violation → đã Ping rồi.
  if ((error as any)?.code === "23505") return "already";
  return "error";
}

/** Trạng thái Ping của đúng cuộc trò chuyện đang mở. */
export function usePingStatus(senderId: string | null, receiverId: string | null) {
  return useQuery({
    queryKey: pingStatusKey(senderId, receiverId),
    queryFn: () => hasPinged(senderId as string, receiverId as string),
    enabled: Boolean(senderId && receiverId && senderId !== receiverId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

/** Cập nhật cache tại chỗ sau khi Ping thành công (không refetch thừa). */
export function useMarkPinged() {
  const qc = useQueryClient();
  return useCallback(
    (senderId: string | null, receiverId: string | null) => {
      qc.setQueryData(pingStatusKey(senderId, receiverId), true);
    },
    [qc],
  );
}
