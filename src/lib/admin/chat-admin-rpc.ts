/**
 * RPC quản trị Inbox / Chat Admin — CHẠY TRÊN SUPABASE #3.
 *
 * Sau khi module chat cutover sang #3 (xem `supabase/sql/MIGRATE_CHAT_TO_SB3.sql`),
 * mọi bảng chat (`messages`, `conversations`, `chat_partners`,
 * `message_reactions`, `conversation_clears`) nằm ở #3. Do đó các RPC quản trị
 * cũng phải gọi bằng client `db3()` — nếu vẫn gọi ở #1 thì Tab "Tin nhắn" của
 * Admin Panel sẽ đọc/ghi sai database.
 *
 * Vì `profiles` vẫn ở #1, RPC bên #3 chỉ trả về id + số liệu. Tên/username/
 * avatar của khách được ghép thêm từ #1 trong file này (một query duy nhất).
 */
import { db3, supabase as coreClient } from "@/lib/db/router";

const s3 = () => db3() as any;
const s1 = coreClient as any;

export type InboxRow = { account_id: string; unread: number; last_at: string | null };

export type AdminThread = {
  peer_id: string;
  peer_username: string | null;
  peer_name: string | null;
  peer_avatar: string | null;
  last_content: string | null;
  last_at: string | null;
  unread: number;
};

export type AdminThreadMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string | null;
};

/** Danh sách id tài khoản nội bộ (clone) — profiles vẫn ở Supabase #1. */
export async function internalAccountIds(): Promise<string[]> {
  const { data, error } = await s1
    .from("profiles")
    .select("id")
    .eq("account_source", "internal");
  if (error) throw error;
  return (data ?? []).map((r: any) => String(r.id));
}

/** Hộp thư của từng clone: số tin chưa đọc + thời điểm tin mới nhất. */
export async function adminInboxByAccount(accountIds?: string[]): Promise<InboxRow[]> {
  const ids = accountIds?.length ? accountIds : await internalAccountIds();
  if (!ids.length) return [];
  const { data, error } = await s3().rpc("admin_internal_inbox_by_account", {
    p_accounts: ids,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    account_id: String(r.account_id),
    unread: Number(r.unread ?? 0),
    last_at: r.last_at ?? null,
  }));
}

/** Ghép thông tin hiển thị của khách từ Supabase #1. */
async function peerMetaMap(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!ids.length) return map;
  const { data } = await s1
    .from("profiles")
    .select("id, username, full_name, avatar")
    .in("id", ids);
  (data ?? []).forEach((p: any) => map.set(String(p.id), p));
  return map;
}

/** Danh sách hội thoại của 1 clone (mới nhất lên đầu). */
export async function adminThreads(accountId: string): Promise<AdminThread[]> {
  const { data, error } = await s3().rpc("admin_internal_threads", {
    p_account: accountId,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const meta = await peerMetaMap(rows.map((r) => String(r.peer_id)));
  return rows
    .map((r) => {
      const p = meta.get(String(r.peer_id));
      return {
        peer_id: String(r.peer_id),
        peer_username: p?.username ?? null,
        peer_name: p?.full_name ?? null,
        peer_avatar: p?.avatar ?? null,
        last_content: r.last_content ?? null,
        last_at: r.last_at ?? null,
        unread: Number(r.unread ?? 0),
      } satisfies AdminThread;
    })
    .sort((a, b) => {
      const at = a.last_at ? new Date(a.last_at).getTime() : 0;
      const bt = b.last_at ? new Date(b.last_at).getTime() : 0;
      return bt - at;
    });
}

/** Tin nhắn của một hội thoại (đồng thời đánh dấu đã đọc). */
export async function adminThreadMessages(
  accountId: string,
  peerId: string,
  limit = 200,
): Promise<AdminThreadMessage[]> {
  const { data, error } = await s3().rpc("admin_internal_thread_messages", {
    p_account: accountId,
    p_peer: peerId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AdminThreadMessage[];
}

/** Gửi tin nhắn với tư cách clone (ghi vào messages ở #3). */
export async function adminSendMessage(
  accountId: string,
  peerId: string,
  content: string,
  imageUrl?: string | null,
): Promise<string | null> {
  const { data, error } = await s3().rpc("admin_internal_send_message", {
    p_account: accountId,
    p_peer: peerId,
    p_content: content,
    p_image_url: imageUrl ?? null,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Đánh dấu đã đọc toàn bộ tin nhắn gửi tới các clone. */
export async function adminMarkAllRead(accountIds?: string[]): Promise<number> {
  const ids = accountIds?.length ? accountIds : await internalAccountIds();
  if (!ids.length) return 0;
  const { data, error } = await s3().rpc("admin_internal_mark_all_read", {
    p_accounts: ids,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
