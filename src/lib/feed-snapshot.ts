/**
 * feed-snapshot — cache TRANG ĐẦU của Feed qua localStorage.
 *
 * Mục tiêu (giảm Egress PostgREST):
 *  - Quay lại Trang chủ / F5 trong thời gian ngắn → hiển thị NGAY từ cache,
 *    không gọi lại toàn bộ Feed.
 *  - Sau khi trả cache, chạy đồng bộ NỀN (1 lần / key) để làm mới snapshot cho
 *    lượt xem kế tiếp.
 *
 * Không đổi UI, không đổi logic feed: dữ liệu trả về giống hệt kết quả query.
 */

const KEY_PREFIX = "feedsnap:v1:";
/** Trong 90s coi như "vừa xem" → dùng thẳng cache. */
export const FEED_SNAPSHOT_TTL = 90_000;
/** Giới hạn kích thước để không đụng quota localStorage. */
const MAX_BYTES = 400_000;

type Snapshot<T> = { at: number; value: T };

const bg = new Set<string>();

export function snapshotKey(parts: Array<string | number | boolean | null | undefined>): string {
  return KEY_PREFIX + parts.map((p) => String(p ?? "")).join("|");
}

export function readSnapshot<T>(key: string, ttlMs = FEED_SNAPSHOT_TTL): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!parsed || Date.now() - parsed.at > ttlMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify({ at: Date.now(), value } satisfies Snapshot<T>);
    if (raw.length > MAX_BYTES) return;
    localStorage.setItem(key, raw);
  } catch {
    /* quota / private mode — bỏ qua */
  }
}

/** Đồng bộ nền: chỉ 1 lần cho mỗi key trong 1 phiên render. */
export function backgroundRefresh<T>(key: string, run: () => Promise<T>) {
  if (typeof window === "undefined" || bg.has(key)) return;
  bg.add(key);
  const start = () => {
    void run()
      .then((value) => writeSnapshot(key, value))
      .catch(() => {})
      .finally(() => bg.delete(key));
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1200);
}

/** Xoá toàn bộ snapshot (đăng xuất / đổi tài khoản / pull-to-refresh). */
export function clearFeedSnapshots() {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(KEY_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
