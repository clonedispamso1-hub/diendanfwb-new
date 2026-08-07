/**
 * <VipMedia> — render Icon VIP / GIF VIP đúng loại file.
 *
 *  .gif .png .jpg .webp .svg …  → <img>
 *  .webm .mp4 …                 → <video autoPlay muted loop playsInline>
 *
 * KHÔNG bao giờ dùng <img> cho .webm/.mp4 (trước đây gây lỗi "ảnh vỡ").
 */
import type { CSSProperties } from "react";
import { isVideoMediaUrl } from "@/lib/media-kind";

export function VipMedia({
  url,
  size,
  width,
  height,
  className,
  style,
  alt = "",
  title,
  onClick,
  objectFit = "contain",
}: {
  url: string;
  /** Cạnh vuông (px). Dùng cho icon/GIF cạnh tên. */
  size?: number;
  /** Cạnh lớn nhất theo chiều ngang (px) — cho GIF trong bài viết. */
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  title?: string;
  onClick?: () => void;
  objectFit?: CSSProperties["objectFit"];
}) {
  if (!url) return null;

  const base: CSSProperties = {
    display: "block",
    objectFit,
    ...(size ? { width: size, height: size } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...style,
  };

  if (isVideoMediaUrl(url)) {
    return (
      <video
        src={url}
        className={className}
        style={base}
        title={title}
        onClick={onClick}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-label={alt || undefined}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      style={base}
      title={title}
      onClick={onClick}
      loading="lazy"
      decoding="async"
    />
  );
}
