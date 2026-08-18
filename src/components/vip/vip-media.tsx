/**
 * <VipMedia> — render Icon VIP / GIF VIP đúng loại file.
 *
 *  .gif .png .jpg .webp .svg …  → <img loading="lazy" decoding="async">
 *  .webm .mp4 …                 → <video autoPlay muted loop playsInline>
 *
 * KHÔNG bao giờ dùng <img loading="lazy" decoding="async"> cho .webm/.mp4 (trước đây gây lỗi "ảnh vỡ").
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isVideoMediaUrl } from "@/lib/media-kind";

/**
 * Chỉ tải/chạy media khi phần tử nằm gần viewport (300px). Ra khỏi màn hình:
 * video được pause, GIF được gỡ src để dừng decode → tiết kiệm CPU/RAM/băng thông.
 */
function useInViewport<T extends HTMLElement>(rootMargin = "300px 0px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setInView(e.isIntersecting); },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}

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
  const isVideo = isVideoMediaUrl(url || "");
  const { ref: imgRef, inView: imgIn } = useInViewport<HTMLImageElement>();
  const { ref: videoRef, inView: videoIn } = useInViewport<HTMLVideoElement>();

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (videoIn) { void v.play?.().catch(() => {}); } else { v.pause?.(); }
  }, [videoIn, videoRef]);

  if (!url) return null;

  const base: CSSProperties = {
    display: "block",
    objectFit,
    ...(size ? { width: size, height: size } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...style,
  };

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={url}
        className={className}
        style={base}
        title={title}
        onClick={onClick}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        aria-label={alt || undefined}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      src={imgIn ? url : undefined}
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
