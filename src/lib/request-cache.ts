/**
 * request-cache — dedupe + TTL cache cho các truy vấn Supabase lặp lại.
 *
 * Mục tiêu: giảm Egress + số request. Hai cơ chế:
 *  1. In-flight dedupe: N nơi gọi cùng key trong cùng lúc → chỉ 1 request.
 *  2. TTL cache: kết quả được dùng lại trong `ttlMs` (mặc định 60s).
 *
 * Thuần frontend, không đổi schema / RLS / API key.
 */

type Entry<T> = { value: T; at: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL = 60_000;

/** Chạy `fn` với dedupe + cache theo `key`. */
export function cachedQuery<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const task = fn()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, task as Promise<unknown>);
  return task;
}

/** Đọc cache thô (không fetch) — dùng để render tức thì. */
export function peekCache<T>(key: string, ttlMs = DEFAULT_TTL): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  return null;
}

export function setCache<T>(key: string, value: T) {
  store.set(key, { value, at: Date.now() });
}

/** Xoá theo prefix (vd sau khi user đăng xuất / đổi hồ sơ). */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
