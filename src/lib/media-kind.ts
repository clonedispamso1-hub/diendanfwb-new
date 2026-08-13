/**
 * Nhận biết loại media từ URL (dùng chung cho Icon VIP / GIF VIP / sticker).
 *
 *  - Ảnh động/tĩnh (.gif .png .jpg .jpeg .webp .svg .avif .apng .bmp .ico) → <img loading="lazy" decoding="async">
 *  - Video ngắn     (.webm .mp4 .mov .m4v)                                 → <video autoplay muted loop playsinline>
 *
 * URL Cloudinary có thể kèm query (?_a=...) hoặc transform, nên phải bỏ
 * query/hash trước khi đọc phần mở rộng.
 */

const VIDEO_RE = /\.(webm|mp4|mov|m4v)$/i;
const IMAGE_RE = /\.(gif|png|jpe?g|webp|svg|avif|apng|bmp|ico|tiff?)$/i;

/** Bỏ query string + hash để lấy đường dẫn thuần. */
function cleanPath(url: string): string {
  return String(url).split("#")[0].split("?")[0];
}

/** URL này phải render bằng thẻ <video>? */
export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const p = cleanPath(url);
  if (VIDEO_RE.test(p)) return true;
  // Cloudinary video delivery: /video/upload/...
  return /\/video\/upload\//i.test(p) && !IMAGE_RE.test(p);
}

/** URL này render bằng thẻ <img loading="lazy" decoding="async">? (mặc định khi không phải video) */
export function isImageMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  return !isVideoMediaUrl(url);
}

export type MediaKind = "image" | "video";

export function mediaKind(url?: string | null): MediaKind {
  return isVideoMediaUrl(url) ? "video" : "image";
}
