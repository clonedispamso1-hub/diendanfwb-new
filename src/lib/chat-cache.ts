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
import type { MessageRecord } from "@/lib/app-types";

export const CHAT_PAGE_SIZE = 40;

type CacheEntry = { rows: MessageRecord[]; hasMore: boolean; at: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const keyOf = (meId: string, peerId: string) => `${meId}::${peerId}`;

/** Lọc tin đã "xoá chỉ mình tôi" (soft-delete phía user hiện tại). */
function visibleForMe(rows: any[], meId: string): MessageRecord[] {
  return rows.filter((m) => {
    if (m.sender_id === meId && m.sender_deleted_at) return false;
    if (m.receiver_id === meId && m.receiver_deleted_at) return false;
    return true;
  }) as MessageRecord[];
}

async function queryPage(
  meId: string,
  peerId: string,
  clearedAt: number,
  before?: string | null,
): Promise<{ rows: MessageRecord[]; hasMore: boolean }> {
  let query = supabase
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`,
    )
    .order("created_at", { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (clearedAt > 0) query = query.gt("created_at", new Date(clearedAt).toISOString());
  if (before) query = query.lt("created_at", before);

  const { data } = await query;
  const raw = ((data as any[]) || []);
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
