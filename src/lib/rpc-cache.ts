/**
 * rpc-cache — lớp cache TTL + gộp request (in-flight dedupe) cho các RPC/query
 * được gọi lặp lại trên nhiều component & mỗi lần đổi route.
 *
 * Mục tiêu: KHÔNG spam Database (nguyên nhân 522 / DB Unhealthy).
 * - Kết quả được giữ trong bộ nhớ theo TTL (mặc định 10 phút).
 * - Nhiều lời gọi song song cùng key chỉ tạo 1 request.
 * - Có thể xoá cache khi Admin lưu cấu hình (invalidateRpcCache).
 */

type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const TTL_SHORT = 60_000; // 1 phút
export const TTL_MEDIUM = 5 * 60_000; // 5 phút
export const TTL_LONG = 10 * 60_000; // 10 phút

/** Lấy dữ liệu qua cache TTL; chỉ gọi `loader` khi cache hết hạn. */
export async function cachedCall<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = TTL_LONG,
  force = false,
): Promise<T> {
  if (!force) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
  }

  const task = (async () => {
    try {
      const value = await loader();
      store.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      // Không cache lỗi — nhưng cũng không retry ngay (caller tự xử lý).
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/** Đọc giá trị cache còn hạn (nếu có) mà không gọi mạng. */
export function peekCache<T>(key: string, ttlMs: number = TTL_LONG): T | undefined {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  return undefined;
}

/** Xoá cache: theo tiền tố key, hoặc toàn bộ khi không truyền tham số. */
export function invalidateRpcCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/** Throttle đơn giản theo key — dùng cho các kiểm tra nền (tracking, status). */
const lastRun = new Map<string, number>();
export function shouldRun(key: string, minGapMs: number): boolean {
  const now = Date.now();
  const prev = lastRun.get(key) ?? 0;
  if (now - prev < minGapMs) return false;
  lastRun.set(key, now);
  return true;
}
