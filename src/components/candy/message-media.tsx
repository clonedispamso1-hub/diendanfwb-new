import { useState } from "react";
import { isVideoMediaUrl } from "@/lib/media-kind";
import { MediaLoadError } from "@/components/candy/post-media";

/**
 * Media trong tin nhắn từ một URL trực tiếp (ảnh hoặc video).
 * Ảnh lỗi → thử phát bằng <video>; lỗi tiếp → ô "Không tải được media" + link mở.
 */
export function MessageMedia({ url, className }: { url: string; className?: string }) {
  const [mode, setMode] = useState<"image" | "video" | "error">(isVideoMediaUrl(url) ? "video" : "image");
  if (mode === "error") return <MediaLoadError url={url} />;
  if (mode === "video") {
    return (
      <video
        src={url}
        controls
        muted
        playsInline
        preload="metadata"
        className={className}
        style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "hsl(var(--muted))" }}
        onError={() => setMode("error")}
      />
    );
  }
  return (
    <img
      src={url}
      alt="Ảnh trong tin nhắn"
      className={className}
      loading="lazy"
      decoding="async"
      style={{ maxWidth: "100%" }}
      onError={() => setMode("video")}
    />
  );
}
