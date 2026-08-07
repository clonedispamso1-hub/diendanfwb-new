import type { CSSProperties } from "react";

/** Trả về true nếu URL là file video (.webm / .mp4) — kể cả khi có query string. */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  return clean.endsWith(".webm") || clean.endsWith(".mp4");
}

interface MediaItemProps {
  url: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Render media trong Admin Panel: video (.webm/.mp4) tự chạy như GIF,
 * còn lại dùng <img>. CSS/class giữ nguyên cho cả hai thẻ.
 */
export function MediaItem({ url, alt = "", className, style }: MediaItemProps) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={className}
        style={style}
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
