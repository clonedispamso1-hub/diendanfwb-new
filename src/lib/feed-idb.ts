/**
 * feed-idb — cache nhẹ Feed Trang Chủ trên IndexedDB.
 *
 *  - Chỉ lưu METADATA + URL media (đúng các hàng đã hydrate để render),
 *    KHÔNG lưu bytes ảnh/video.
 *  - Tối đa FEED_CACHE_LIMIT bài thường (mới nhất theo created_at) + bài ghim.
 *  - Key theo tab / user / danh mục → đổi tài khoản không dính cache người khác.
 *  - Mọi lỗi IndexedDB (private mode, quota…) đều bị bỏ qua → Feed tải như cũ.
 */

export const FEED_CACHE_LIMIT = 20;
/** Cache quá hạn này thì bỏ, tải mới toàn bộ. */
export const FEED_CACHE_MAX_AGE = 24 * 60 * 60_000;

const DB_NAME = "feed-cache";
const STORE = "feeds";
const VERSION = 1;

export interface FeedCacheRecord {
  at: number;
  /** Bài ghim (giữ nguyên thứ tự). */
  pinned: any[];
  /** Bài thường, sắp created_at DESC, tối đa FEED_CACHE_LIMIT. */
  rows: any[];
  hasMore: boolean;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          t.oncomplete = () => resolve(req ? (req.result as T) : null);
          t.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function feedCacheKey(isPrivate: boolean, meId: string | null | undefined, category?: string | null) {
  return `v1|${isPrivate ? "private" : "general"}|${meId ?? "anon"}|${category ?? "all"}`;
}

export async function readFeedCache(key: string): Promise<FeedCacheRecord | null> {
  const rec = await tx<FeedCacheRecord>("readonly", (s) => s.get(key));
  if (!rec || !Array.isArray(rec.rows) || Date.now() - rec.at > FEED_CACHE_MAX_AGE) return null;
  return rec;
}

const ts = (r: any) => new Date(r?.created_at || 0).getTime();
const byNewest = (a: any, b: any) => ts(b) - ts(a) || String(b?.id).localeCompare(String(a?.id));

/**
 * Ghi cache.
 *  - `rows`: danh sách hiện tại (bài ghim + bài thường).
 *  - `keepOlder`: giữ lại các hàng cache cũ hơn bài cũ nhất trong `rows`
 *    (vd. 10 bài prefetch trước) — bài đã bị xoá trong `rows` vẫn bị loại.
 */
export async function writeFeedCache(
  key: string,
  rows: any[],
  opts: { hasMore: boolean; keepOlder?: boolean; pinned?: any[] },
): Promise<void> {
  const pinned = opts.pinned ?? rows.filter((r) => r?.is_pinned === true);
  let normal = rows.filter((r) => r && r.id && r.is_pinned !== true && !String(r.id).startsWith("temp"));
  if (opts.keepOlder) {
    const prev = await readFeedCache(key);
    if (prev && normal.length) {
      const oldest = Math.min(...normal.map(ts));
      const ids = new Set(normal.map((r) => r.id));
      normal = normal.concat(prev.rows.filter((r) => !ids.has(r.id) && ts(r) < oldest));
    }
  }
  const seen = new Set<string>();
  normal = normal
    .sort(byNewest)
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .slice(0, FEED_CACHE_LIMIT);
  const rec: FeedCacheRecord = {
    at: Date.now(),
    pinned: JSON.parse(JSON.stringify(pinned)),
    rows: JSON.parse(JSON.stringify(normal)),
    hasMore: opts.hasMore,
  };
  await tx("readwrite", (s) => s.put(rec, key));
}

/** Xoá toàn bộ cache Feed (logout / đổi tài khoản / làm mới). */
export function clearFeedCache(): void {
  void tx("readwrite", (s) => s.clear());
}
