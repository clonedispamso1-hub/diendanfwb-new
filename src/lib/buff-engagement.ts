// src/lib/buff-engagement.ts
// Buff Like & View "tự nhiên" — hoàn toàn client-side, deterministic từ
// (post.id, created_at). KHÔNG đụng DB, KHÔNG dùng setInterval/timer.
// Mỗi lần Feed render, hàm được gọi và trả về số hiện tại dựa trên tuổi bài.
//
// Quy tắc (theo spec):
//   • 0-15 phút đầu: KHÔNG buff (chỉ hiển thị số thật).
//   • Sau 15 phút: sinh Target Like theo phân bố:
//       70%   100 - 800
//       20%   800 - 2500
//        8%   2500 - 5000
//        2%   5000 - 8000
//   • Target View = Target Like × (1.01 - 1.03).
//   • Tăng mượt (ease-out) trong ~24 giờ, không nhảy từ 0 → nghìn.
//   • Cộng thẳng vào Like/View THẬT — real like vẫn ghi vào DB như cũ.
//   • View luôn > Like ở phần buff (do multiplier).

const NO_BUFF_MINUTES = 15;
const RAMP_HOURS = 24; // sau ~24h đạt gần target

// FNV-1a hash → seed ổn định từ post id.
function seedFromId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(id.length - 1 - i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // trộn thêm 1 vòng để phân bố đều hơn
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

// PRNG deterministic (mulberry32).
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTierMax(rand: () => number): { min: number; max: number } {
  const r = rand();
  if (r < 0.70) return { min: 100, max: 800 };
  if (r < 0.90) return { min: 800, max: 2500 };
  if (r < 0.98) return { min: 2500, max: 5000 };
  return { min: 5000, max: 8000 };
}

export interface BuffResult {
  buffLikes: number;
  buffViews: number;
  targetLikes: number;
  targetViews: number;
}

/**
 * Tính lượng like/view mô phỏng cho 1 bài viết.
 * @param postId   UUID (hoặc bất kỳ id ổn định) của bài
 * @param createdAt ISO string / Date / ms
 * @param nowMs    (test) override thời điểm hiện tại
 */
export function computePostBuff(
  postId: string | null | undefined,
  createdAt: string | number | Date | null | undefined,
  nowMs: number = Date.now(),
): BuffResult {
  const empty: BuffResult = { buffLikes: 0, buffViews: 0, targetLikes: 0, targetViews: 0 };
  if (!postId || !createdAt) return empty;
  const created = new Date(createdAt as any).getTime();
  if (!Number.isFinite(created)) return empty;
  const ageMin = (nowMs - created) / 60000;
  if (ageMin < NO_BUFF_MINUTES) return empty;

  const seed = seedFromId(String(postId));
  const rand = rngFrom(seed);

  // Target Like theo phân bố tự nhiên.
  const tier = pickTierMax(rand);
  const targetLikes = Math.round(tier.min + rand() * (tier.max - tier.min));

  // Target View = Like × (1.01 - 1.03).
  const viewMul = 1.01 + rand() * 0.02;
  const targetViews = Math.round(targetLikes * viewMul);

  // Progress theo tuổi bài: 0 tại t=15p, 1 tại t=15p+24h. Ease-out mượt.
  const rampMin = RAMP_HOURS * 60;
  const t = Math.min(1, (ageMin - NO_BUFF_MINUTES) / rampMin);
  // Ease-out cubic → tăng nhanh lúc đầu, chậm dần khi gần target (giống viral thật).
  const base = 1 - Math.pow(1 - t, 3);

  // Jitter ổn định theo (seed, phút hiện tại) để mỗi khoảng vài giây chỉ
  // dao động rất nhẹ (±0.6%). Không phá tính đơn điệu tổng thể.
  const minuteBucket = Math.floor((nowMs - created) / 60000);
  const jitterRand = rngFrom((seed ^ minuteBucket) >>> 0);
  const jitter = (jitterRand() - 0.5) * 0.012; // ±0.6%
  const factor = Math.max(0, Math.min(1, base + jitter));

  const buffLikes = Math.max(0, Math.round(targetLikes * factor));
  // View luôn > Like: dùng cùng factor rồi cộng thêm chênh lệch multiplier.
  const buffViews = Math.max(buffLikes, Math.round(targetViews * factor));

  return { buffLikes, buffViews, targetLikes, targetViews };
}
