/**
 * request-cache — dedupe + TTL cache cho các truy vấn Supabase lặp lại.
 *
 * Mục tiêu: giảm Egress + số request. Ba cơ chế:
 *  1. In-flight dedupe: N nơi gọi cùng key trong cùng lúc → chỉ 1 request.
 *  2. TTL cache trong bộ nhớ: kết quả được dùng lại trong `ttlMs` (mặc định 60s).
 *  3. (Tuỳ chọn) Persist localStorage: dữ liệu ÍT ĐỔI (gift, sticker, emoji,
 *     danh mục, cấu hình, tỉnh/thành, VIP…) vẫn còn sau khi F5 / mở lại web
 *     → không gọi API mỗi lần mở trang.
 *
 * Thuần frontend, không đổi schema / RLS / API key.
 */

type Entry<T> = { value: T; at: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL = 60_000;

const LS_PREFIX = "reqcache:v1:";
const LS_MAX_BYTES = 200_000;

export interface CacheOptions {
  /** Lưu xuống localStorage để dùng lại sau khi tải lại trang. */
  persist?: boolean;
}

function lsRead<T>(key: string, ttlMs: number): Entry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || Date.now() - parsed.at >= ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function lsWrite<T>(key: string, entry: Entry<T>) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > LS_MAX_BYTES) return;
    localStorage.setItem(LS_PREFIX + key, raw);
  } catch {
    /* quota — bỏ qua */
  }
}

function lsRemove(prefix?: string) {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(LS_PREFIX)) continue;
      if (!prefix || k.slice(LS_PREFIX.length).startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Chạy `fn` với dedupe + cache theo `key`. */
export function cachedQuery<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL,
  opts: CacheOptions = {},
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

  if (opts.persist) {
    const disk = lsRead<T>(key, ttlMs);
    if (disk) {
      store.set(key, disk as Entry<unknown>);
      return Promise.resolve(disk.value);
    }
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const task = fn()
    .then((value) => {
      const entry: Entry<T> = { value, at: Date.now() };
      store.set(key, entry as Entry<unknown>);
      if (opts.persist) lsWrite(key, entry);
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
  const disk = lsRead<T>(key, ttlMs);
  if (disk) {
    store.set(key, disk as Entry<unknown>);
    return disk.value;
  }
  return null;
}

export function setCache<T>(key: string, value: T, opts: CacheOptions = {}) {
  const entry: Entry<T> = { value, at: Date.now() };
  store.set(key, entry as Entry<unknown>);
  if (opts.persist) lsWrite(key, entry);
}

/** Xoá theo prefix (vd sau khi user đăng xuất / đổi hồ sơ). */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    lsRemove();
    return;
  }
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  lsRemove(prefix);
}
