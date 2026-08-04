/**
 * Live Móc 🦋 — BỘ ĐẾM CHUNG CHO TOÀN WEBSITE.
 *
 * Nguyên tắc: KHÔNG random riêng ở mỗi client, KHÔNG polling, KHÔNG realtime,
 * KHÔNG ghi DB mỗi giây. Công thức xác định (deterministic):
 *
 *      current = seed + tổng_bước_tăng(roomId, số_giây_đã_live)
 *
 * - seed  = giá trị Admin nhập (viewers / likes / comments) — mốc khởi điểm.
 * - bước tăng mỗi giây lấy từ bảng xorshift32 cố định theo roomId ⇒ mọi máy,
 *   mọi lần F5 đều ra CÙNG một con số tại cùng một giây.
 * - tính O(1) bằng mảng prefix-sum ⇒ website rất nhẹ.
 */

export type LiveMetric = "viewers" | "likes" | "comments";

/** Số giây trong 1 chu kỳ bảng bước (chu kỳ lặp lại nhưng giá trị vẫn cộng dồn). */
const CYCLE = 128;

/** Bước tăng mỗi giây theo từng chỉ số (giữ nhịp "như thật"). */
function stepOf(metric: LiveMetric, r: number): number {
  if (metric === "viewers") return r < 0.15 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3;
  if (metric === "likes") return r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
  return r < 0.72 ? 0 : 1; // comments
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Cycle = { prefix: number[]; total: number };
const cache = new Map<string, Cycle>();

function cycleFor(key: string, metric: LiveMetric): Cycle {
  const ck = `${key}|${metric}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  let s = hashSeed(ck) || 1;
  const prefix: number[] = [0];
  for (let i = 0; i < CYCLE; i += 1) {
    // xorshift32 — rẻ, không cần thư viện.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    prefix.push(prefix[i] + stepOf(metric, s / 4294967296));
  }
  const cyc = { prefix, total: prefix[CYCLE] };
  cache.set(ck, cyc);
  return cyc;
}

/** Tổng bước tăng sau `n` giây — O(1). */
function growth(key: string, metric: LiveMetric, n: number): number {
  if (n <= 0) return 0;
  const { prefix, total } = cycleFor(key, metric);
  return Math.floor(n / CYCLE) * total + prefix[n % CYCLE];
}

/**
 * Giá trị hiện tại của một chỉ số: seed + tăng dần theo thời gian đã Live.
 * Không bao giờ nhỏ hơn seed ⇒ F5 / đổi máy / đổi tab đều không reset.
 */
export function liveCounterValue(
  roomId: string,
  metric: LiveMetric,
  seed: number,
  elapsedSec: number,
): number {
  const base = Math.max(0, Math.round(seed || 0));
  const t = Math.max(0, Math.floor(elapsedSec));
  return base + growth(roomId, metric, t);
}

export type LiveCounters = { viewers: number; likes: number; comments: number };

export type LiveCounterRoom = {
  id: string;
  viewers: number;
  likes: number;
  comments: number;
  started_at?: string;
  /** Dự phòng khi Admin chưa nhập started_at. */
  created_at?: string;
  is_online: boolean;
};

/** Mốc bắt đầu Live thực tế: started_at → created_at → null. */
export function resolveLiveStart(room: { started_at?: string; created_at?: string }): number | null {
  for (const raw of [room.started_at, room.created_at]) {
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

/** Số giây đã Live (>= 0). Không có mốc nào → 0 (hiển thị đúng seed). */
export function liveElapsedSeconds(
  room: { started_at?: string; created_at?: string },
  now: number,
): number {
  const start = resolveLiveStart(room);
  if (start == null) return 0;
  return Math.max(0, (now - start) / 1000);
}

/** Bộ 3 chỉ số của một phòng tại thời điểm `now`. */
export function liveCountersFor(room: LiveCounterRoom, now: number): LiveCounters {
  if (!room.is_online) {
    return { viewers: room.viewers, likes: room.likes, comments: room.comments };
  }
  const elapsed = liveElapsedSeconds(room, now);
  return {
    viewers: liveCounterValue(room.id, "viewers", room.viewers, elapsed),
    likes: liveCounterValue(room.id, "likes", room.likes, elapsed),
    comments: liveCounterValue(room.id, "comments", room.comments, elapsed),
  };
}
