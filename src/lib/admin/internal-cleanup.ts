/**
 * Dọn thông báo / đánh dấu đã đọc cho các tài khoản nội bộ (clone).
 *
 * Ưu tiên RPC SECURITY DEFINER; nếu RPC CHƯA tồn tại trong database
 * (lỗi PGRST202 "Could not find the function ... in the schema cache")
 * thì tự động fallback sang query trực tiếp để KHÔNG bao giờ báo lỗi ra UI.
 */
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

function isMissingFunction(error: any): boolean {
  const msg = `${error?.message ?? ""} ${error?.code ?? ""}`;
  return /PGRST202|Could not find the function|does not exist|schema cache/i.test(msg);
}

async function internalAccountIds(): Promise<string[]> {
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .eq("account_source", "internal");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id as string);
}

/** Đánh dấu đã đọc toàn bộ tin nhắn gửi tới tài khoản nội bộ (nội dung chat giữ nguyên). */
export async function markAllInternalMessagesRead(): Promise<void> {
  const { error } = await sb.rpc("admin_internal_mark_all_read");
  if (!error) return;
  if (!isMissingFunction(error)) throw error;

  const ids = await internalAccountIds();
  if (!ids.length) return;
  const { error: upErr } = await sb
    .from("messages")
    .update({ is_read: true })
    .in("receiver_id", ids)
    .eq("is_read", false);
  if (upErr) throw upErr;
}

/** Xoá toàn bộ thông báo của tài khoản nội bộ (hoặc 1 tài khoản cụ thể). */
export async function clearInternalNotifications(accountId?: string | null): Promise<void> {
  const { error } = await sb.rpc("admin_internal_notif_clear_all", {
    p_account: accountId ?? null,
  });
  if (!error) return;
  if (!isMissingFunction(error)) throw error;

  const ids = accountId ? [accountId] : await internalAccountIds();
  if (!ids.length) return;
  const { error: delErr } = await sb.from("notifications").delete().in("user_id", ids);
  if (delErr) throw delErr;
}

/**
 * Đánh dấu ĐÃ XEM hàng loạt cho toàn bộ hội thoại của tài khoản nội bộ (Clone):
 * cập nhật `last_read = now()` trên bảng conversation_reads (nếu có) và
 * `is_read = true` cho các tin nhắn thành viên đã gửi tới Clone.
 * → phía thành viên sẽ thấy ✓✓ Đã xem.
 *
 * Chỉ chạy một lần khi admin bấm nút (không polling).
 */
export async function markAllInternalConversationsSeen(): Promise<void> {
  const { error } = await sb.rpc("admin_internal_mark_all_seen");
  if (!error) return;
  if (!isMissingFunction(error)) throw error;

  const ids = await internalAccountIds();
  if (!ids.length) return;

  // Tin nhắn thành viên gửi tới Clone → đã đọc.
  const { error: upErr } = await sb
    .from("messages")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in("receiver_id", ids)
    .eq("is_read", false);
  if (upErr) {
    // Schema có thể chưa có cột read_at → thử lại chỉ với is_read.
    const { error: retryErr } = await sb
      .from("messages")
      .update({ is_read: true })
      .in("receiver_id", ids)
      .eq("is_read", false);
    if (retryErr) throw retryErr;
  }
}
