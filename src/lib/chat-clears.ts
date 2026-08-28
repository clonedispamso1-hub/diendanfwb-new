/**
 * Nguồn duy nhất cho mốc "Xoá cuộc trò chuyện" (bảng `conversation_clears`).
 *
 * Lý do tồn tại: openChat() có thể chạy TRƯỚC khi effect load clearedMap xong
 * (mở chat từ Hồ sơ / Deep link) → race condition làm tin nhắn cũ hiện lại.
 * `ensureClearsMap()` đảm bảo luôn có map hợp lệ trước khi query message:
 * - cache trong memory theo user
 * - dedupe request đang bay (nhiều nơi gọi cùng lúc chỉ tốn 1 query)
 *
 * KHÔNG tạo bảng mới — chỉ đọc/ghi đúng bảng `conversation_clears` hiện có.
 */
import { chatDb } from "@/lib/chat-db";

export type ClearsMap = Record<string, number>;

let cacheUserId: string | null = null;
let cacheMap: ClearsMap | null = null;
let inflight: Promise<ClearsMap> | null = null;

/** Đọc thẳng từ DB (luôn bỏ qua cache). */
export async function fetchClearsMap(meId: string): Promise<ClearsMap> {
  if (!meId) return {};
  const { data } = await chatDb()
    .from("conversation_clears" as any)
    .select("partner_id, cleared_at")
    .eq("user_id", meId);
  const map: ClearsMap = {};
  for (const r of ((data as any[]) || [])) {
    const ts = new Date(r.cleared_at).getTime();
    if (r.partner_id && !Number.isNaN(ts)) map[r.partner_id] = ts;
  }
  cacheUserId = meId;
  cacheMap = map;
  return map;
}

/**
 * Trả về clears map, ưu tiên cache. Gọi trước MỌI truy vấn message để tránh
 * race condition khi openChat() chạy sớm hơn effect nạp map.
 */
export async function ensureClearsMap(meId: string): Promise<ClearsMap> {
  if (!meId) return {};
  if (cacheUserId === meId && cacheMap) return cacheMap;
  if (inflight && cacheUserId === meId) return inflight;
  cacheUserId = meId;
  inflight = fetchClearsMap(meId).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Đồng bộ cache khi vừa xoá 1 hội thoại (không cần chờ round-trip DB). */
export function setLocalClear(meId: string, partnerId: string, at: number): void {
  if (cacheUserId !== meId || !cacheMap) {
    cacheUserId = meId;
    cacheMap = {};
  }
  cacheMap = { ...cacheMap, [partnerId]: at };
}

/** Ghi đè cache bằng map mới nhất (sau khi refresh từ DB). */
export function primeClearsCache(meId: string, map: ClearsMap): void {
  cacheUserId = meId;
  cacheMap = map;
}

/** Xoá cache khi đổi tài khoản / đăng xuất. */
export function resetClearsCache(): void {
  cacheUserId = null;
  cacheMap = null;
  inflight = null;
}
