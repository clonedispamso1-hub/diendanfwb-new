import { useState } from "react";
import { Play, Sparkles } from "lucide-react";
import { MediaLightbox } from "./post-media";

/**
 * "Tin nổi bật" cho Tài khoản thứ hai: mỗi video (URL ngoài) từ bài đăng Admin Panel
 * là một ô, vuốt ngang trên mobile. Chỉ đọc URL — không tải/lưu file.
 */
export function CloneVideoHighlights({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (urls.length === 0) return null;
  return (
    <section className="featured-moments" aria-label="Tin nổi bật">
      <div className="featured-moments-header">
        <span className="featured-moments-title">
          <Sparkles size={14} aria-hidden /> Tin nổi bật
        </span>
      </div>
      <div className="featured-moments-scroller">
        <div className="featured-moments-track">
          {urls.map((url, i) => (
            <div key={url} className="featured-moment-card">
              <button
                type="button"
                className="featured-moment-media relative w-full"
                aria-label={`Video nổi bật ${i + 1}`}
                onClick={() => setOpen(i)}
              >
                <video
                  src={url}
                  muted
                  playsInline
                  preload="metadata"
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none h-full w-full object-cover"
                />
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground shadow-sm">
                  <Play size={11} fill="currentColor" aria-hidden />
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
      {open !== null ? (
        <MediaLightbox
          items={urls.map((u) => ({ url: u, kind: "video" as const }))}
          startIndex={open}
          alt="Video nổi bật"
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
