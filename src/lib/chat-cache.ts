/**
 * Cache + phân trang tin nhắn 1-1 (frontend-only).
 *
 * Mục tiêu: bấm vào cuộc trò chuyện là hiện tin nhắn NGAY (từ cache),
 * sau đó mới refresh nền. Chỉ tải PAGE_SIZE tin gần nhất; tin cũ hơn
 * được tải thêm bằng infinite scroll.
 *
 * Không polling, không websocket riêng — chỉ query khi cần.
 */
import { supabase } from "@/lib/supabase";
import { chatDb } from "@/lib/chat-db";
import type { MessageRecord } from "@/lib/app-types";
import { messageCutoffMs } from "@/lib/message-retention";
import { hiddenMessageIds, hideMessagesForMe } from "@/lib/chat-hidden-messages";

export const CHAT_PAGE_SIZE = 30;

type CacheEntry = { rows: MessageRecord[]; hasMore: boolean; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const keyOf = (meId: string, peerId: string) => `${meId}::${peerId}`;

/**
 * Danh sách cột mong muốn. Một số DB cũ KHÔNG có đủ cột (ví dụ `image`,
 * `reply_to`) — PostgREST khi đó trả lỗi 42703 và toàn bộ query fail, khiến
 * tin nhắn "biến mất" sau khi F5. Ta tự loại cột thiếu ra và thử lại, rồi
 * ghi nhớ danh sách cột hợp lệ cho các lần sau.
 */
const DESIRED_COLUMNS = [
  "id",
  "sender_id",
  "receiver_id",
  "content",
  "image_url",
  // `image` đã được thêm vào bảng `messages` trên Supabase 3 → select lại
  // bình thường. Cơ chế fallback bên dưới vẫn giữ nguyên cho các DB khác.
  "image",


  "is_read",
  "created_at",
  "reply_to",
  "edited_at",
  "is_recalled",
  "recalled_at",
  "sender_deleted_at",
  "receiver_deleted_at",
  // "Xoá phía tôi" chuẩn mới: uuid[] chứa id của những user đã ẩn tin này.
  "deleted_by_users",
];
const REQUIRED_COLUMNS = new Set(["id", "sender_id", "receiver_id", "content", "created_at"]);
let activeColumns: string[] = [...DESIRED_COLUMNS];

function missingColumnFrom(error: any): string | null {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  const m = /column\s+(?:messages\.)?"?([a-z0-9_]+)"?\s+does not exist/i.exec(msg);
  return m?.[1] ?? null;
}

/**
 * Lọc tin đã "xoá chỉ mình tôi" (soft-delete phía user hiện tại).
 * Nguồn lọc: cột DB (`deleted_by_users`, `sender/receiver_deleted_at`) HOẶC
 * danh sách bền vững ở máy (phòng khi ghi DB thất bại) — xem
 * `@/lib/chat-hidden-messages`.
 */
export function visibleForMe(rows: any[], meId: string): MessageRecord[] {
  const hidden = hiddenMessageIds(meId);
  return rows.filter((m) => {
    if (hidden.has(String(m.id))) return false;
    if (Array.isArray(m.deleted_by_users) && m.deleted_by_users.includes(meId)) return false;
    if (m.sender_id === meId && m.sender_deleted_at) return false;
    if (m.receiver_id === meId && m.receiver_deleted_at) return false;
    return true;
  }) as MessageRecord[];
}

/**
 * "Xoá tin nhắn phía tôi" — gọi RPC `hide_message_for_me` trên Supabase #3
 * (SECURITY DEFINER, thêm `auth.uid()` vào mảng `deleted_by_users`).
 * KHÔNG còn fallback UPDATE trực tiếp `public.messages`.
 * Dù RPC có lỗi, tin vẫn bị ẩn vĩnh viễn ở máy này (chat-hidden-messages).
 * Ném lỗi ra ngoài để caller hiển thị thông báo thân thiện.
 */
export async function deleteMessageForMe(
  meId: string,
  message: { id: string; sender_id?: string | null; deleted_by_users?: string[] | null },
): Promise<void> {
  // 1) Ẩn bền vững phía client TRƯỚC — không phụ thuộc DB.
  hideMessagesForMe(meId, [message.id]);
  // 2) Dọn khỏi mọi cache trong bộ nhớ để mở lại từ Hồ sơ không thấy nữa.
  for (const [key, entry] of cache) {
    if (!key.startsWith(`${meId}::`)) continue;
    const rows = entry.rows.filter((m: any) => m.id !== message.id);
    if (rows.length !== entry.rows.length) cache.set(key, { ...entry, rows });
  }

  // 3) Ghi xuống DB qua RPC đã cài trên Supabase #3 (đồng bộ đa thiết bị).
  const { error } = await (chatDb() as any).rpc("hide_message_for_me", {
    p_message_id: message.id,
  });
  if (error) throw new Error(error.message || "hide_message_for_me failed");
}

/**
 * "Xoá cuộc trò chuyện" — gọi RPC `hide_conversation_for_me` trên Supabase #3
 * TRƯỚC, chỉ dọn UI/cache sau khi RPC thành công (caller lo phần UI).
 * Ném lỗi ra ngoài để caller hiển thị thông báo thân thiện và KHÔNG xoá UI.
 */
export async function hideConversationForMe(meId: string, partnerId: string): Promise<void> {
  const { error } = await (chatDb() as any).rpc("hide_conversation_for_me", {
    p_partner_id: partnerId,
  });
  if (error) throw new Error(error.message || "hide_conversation_for_me failed");
  // RPC thành công → dọn cache trong bộ nhớ của cặp hội thoại này.
  cache.delete(keyOf(meId, partnerId));
}


async function queryPage(
  meId: string,
  peerId: string,
  clearedAt: number,
  before?: string | null,
): Promise<{ rows: MessageRecord[]; hasMore: boolean }> {
  // Chỉ hiển thị tin nhắn trong 72 giờ gần nhất (tự hủy sau 3 ngày).
  const floor = Math.max(clearedAt, messageCutoffMs());

  const run = async (columns: string[]) => {
    let query = chatDb()
      .from("messages")
      // Chỉ lấy cột cần thiết (giảm egress) — không dùng select("*").
      .select(columns.join(", "))
      .or(
        `and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`,
      )
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    if (floor > 0) query = query.gt("created_at", new Date(floor).toISOString());
    if (before) query = query.lt("created_at", before);
    return query;
  };

  let res = await run(activeColumns);
  // Thử tối đa vài lần: mỗi lần loại đúng 1 cột không tồn tại trong DB.
  for (let i = 0; i < 6 && res.error; i++) {
    const bad = missingColumnFrom(res.error);
    if (!bad || REQUIRED_COLUMNS.has(bad)) break;
    activeColumns = activeColumns.filter((c) => c !== bad);
    res = await run(activeColumns);
  }
  if (res.error) {
    console.warn("[chat-cache] load messages failed", res.error);
    return { rows: [], hasMore: false };
  }

  const raw = ((res.data as any[]) || []);
  const hasMore = raw.length >= CHAT_PAGE_SIZE;
  // DB trả desc → đảo lại thành tăng dần để render.
  return { rows: visibleForMe(raw.slice().reverse(), meId), hasMore };
}


/** Cache hiện có (nếu có) — dùng để render tức thì khi mở chat. */
export function getCachedMessages(meId: string, peerId: string): CacheEntry | null {
  return cache.get(keyOf(meId, peerId)) ?? null;
}

export function setCachedMessages(meId: string, peerId: string, rows: MessageRecord[], hasMore: boolean) {
  cache.set(keyOf(meId, peerId), { rows, hasMore, at: Date.now() });
}

export function clearCachedMessages(meId: string, peerId?: string) {
  if (peerId) cache.delete(keyOf(meId, peerId));
  else cache.clear();
}

/** Tải trang tin nhắn mới nhất (dedupe theo cặp user). */
export async function fetchLatestPage(
  meId: string,
  peerId: string,
  clearedAt: number,
): Promise<CacheEntry> {
  const key = keyOf(meId, peerId);
  const running = inflight.get(key);
  if (running) return running;
  const task = (async () => {
    const { rows, hasMore } = await queryPage(meId, peerId, clearedAt);
    const entry: CacheEntry = { rows, hasMore, at: Date.now() };
    cache.set(key, entry);
    return entry;
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

/** Tải thêm tin CŨ hơn `beforeIso` (infinite scroll lên trên). */
export async function fetchOlderPage(
  meId: string,
  peerId: string,
  clearedAt: number,
  beforeIso: string,
): Promise<{ rows: MessageRecord[]; hasMore: boolean }> {
  return queryPage(meId, peerId, clearedAt, beforeIso);
}

/**
 * Prefetch khi hover / pointerdown trên hàng danh sách chat.
 * Bỏ qua nếu vừa fetch trong 20s để không làm nặng Supabase.
 */
export function prefetchConversation(meId: string, peerId: string, clearedAt: number) {
  if (!meId || !peerId) return;
  const key = keyOf(meId, peerId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return;
  if (inflight.has(key)) return;
  void fetchLatestPage(meId, peerId, clearedAt).catch(() => { /* im lặng */ });
}
