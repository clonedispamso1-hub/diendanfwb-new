/**
 * feed-order.ts — thứ tự hiển thị Feed Trang Chủ.
 *
 * Quy tắc:
 *  1. Bài GHIM luôn ở trên (xử lý ở feed-data, không đụng vào đây).
 *  2. Bài của "Tài khoản thứ hai" (is_second_account / profiles.is_virtual)
 *     được ưu tiên lên đầu.
 *  3. Trong từng nhóm, xáo trộn theo GLOBAL DETERMINISTIC SEED tính từ mốc
 *     thời gian chung → MỌI user F5 đều thấy CÙNG một thứ tự trong cùng cửa
 *     sổ thời gian, nhờ đó tận dụng tối đa cache của Supabase/CDN.
 */

/** Cửa sổ seed dùng chung (5 phút). */
export const FEED_SEED_WINDOW_MS = 5 * 60_000;

/** Seed toàn cục — giống nhau với mọi user trong cùng cửa sổ 5 phút. */
export function globalFeedSeed(now: number = Date.now()): number {
  return Math.floor(now / FEED_SEED_WINDOW_MS);
}

/** Hash ổn định (FNV-1a biến thể) → số thực 0..1, thuần tuý theo id + seed. */
export function seededRank(id: string, seed: number): number {
  let h = 2166136261 ^ (seed >>> 0);
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Bài viết có thuộc "Tài khoản thứ hai" không. */
export function isSecondAccountPost(post: any): boolean {
  if (!post) return false;
  if (post.is_second_account === true) return true;
  const profile = post.profiles;
  return Boolean(profile && (profile.is_virtual === true || profile.is_second_account === true));
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** Bài có ảnh/media (giữ cách nhận biết hiện tại). */
export function hasPostImages(post: any): boolean {
  if (!post) return false;
  if (post.has_images === true || nonEmpty(post.image_url)) return true;
  return Array.isArray(post.image_urls) && post.image_urls.some(nonEmpty);
}

/** Bài có GIF trong bài (`posts.gif_url`) hoặc tác giả có VIP media
 *  (`profiles.vip_media` / `profiles.title_gif_url`). */
export function hasVipMedia(post: any): boolean {
  if (!post) return false;
  if (nonEmpty(post.gif_url)) return true;
  const p = post.profiles;
  if (!p) return false;
  if (nonEmpty(p.title_gif_url)) return true;
  return Array.isArray(p.vip_media) && p.vip_media.some(nonEmpty);
}

/** 2 = VIP GIF/media, 1 = có ảnh, 0 = bài thường. */
export function mediaTier(post: any): number {
  return hasVipMedia(post) ? 2 : hasPostImages(post) ? 1 : 0;
}

/** Seed ngẫu nhiên mới cho MỖI lần hiển thị (đọc từ cache / F5). */
export function randomFeedSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

/**
 * Thứ tự: Tài khoản thứ hai → VIP GIF/media → có ảnh → còn lại;
 * trong từng nhóm xáo trộn theo seed. Thuần tuý, deterministic với (rows, seed).
 */
export function orderFeedRows<T extends { id?: string }>(
  rows: T[],
  seed: number = globalFeedSeed(),
): T[] {
  return [...rows].sort((a, b) => {
    const as = isSecondAccountPost(a) ? 1 : 0;
    const bs = isSecondAccountPost(b) ? 1 : 0;
    if (as !== bs) return bs - as;
    const am = mediaTier(a);
    const bm = mediaTier(b);
    if (am !== bm) return bm - am;
    return seededRank(String((a as any)?.id ?? ""), seed) - seededRank(String((b as any)?.id ?? ""), seed);
  });
}
