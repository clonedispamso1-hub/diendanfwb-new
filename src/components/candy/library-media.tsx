/**
 * <LibraryMedia> — renderer RIÊNG của KHO SỐ 1 ("Kho GIF dùng chung").
 *
 * KHÔNG dùng chung với hệ thống Icon VIP (xem `src/components/vip/vip-media.tsx`).
 *
 *  gif / png / jpg / webp / svg / avif …  → <img loading="lazy" decoding="async">
 *  webm / mp4                            → <video autoplay muted loop playsInline>
 */
import type { CSSProperties } from "react";

/** true nếu URL là file video (.webm / .mp4), kể cả khi có query string. */
export function isLibraryVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  return clean.endsWith(".webm") || clean.endsWith(".mp4");
}

export function LibraryMedia({
  url,
  alt = "",
  className,
  style,
}: {
  url: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (!url) return null;
  if (isLibraryVideoUrl(url)) {
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        className={className}
        style={style}
        aria-label={alt || undefined}
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={style}
    />
  );
}
