import { useState } from "react";
import { Sparkles } from "lucide-react";
import { MediaLightbox } from "./post-media";
import { VideoThumbnail } from "./video-thumbnail";
import { Button } from "@/components/ui/button";

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
              <Button variant="ghost" size="unstyled"
                type="button"
                className="featured-moment-media relative w-full"
                aria-label={`Video nổi bật ${i + 1}`}
                onClick={() => setOpen(i)}
              >
                <VideoThumbnail
                  src={url}
                  className="pointer-events-none h-full w-full object-cover"
                />
              </Button>
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
