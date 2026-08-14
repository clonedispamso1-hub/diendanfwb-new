/**
 * FEEDBACK DETAIL — trang đọc dạng bài viết Facebook/Threads.
 * Không phải lightbox ảnh: ảnh full-width (carousel nếu nhiều ảnh),
 * tên / khu vực / ngày đăng / tim / view / rating + toàn bộ nội dung.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Eye, Heart, MapPin, Star } from "lucide-react";
import { StickyBackHeader } from "@/components/candy/sticky-back-header";
import { Portal } from "@/components/candy/portal";
import {
  formatCount,
  likeCountOf,
  viewCountOf,
  type FeedbackPost,
} from "@/lib/feedback";

/** Admin có thể nhập nhiều ảnh (xuống dòng / dấu phẩy) → carousel. */
export function imagesOf(post: FeedbackPost): string[] {
  const raw = `${post.image_url || ""}`.trim() || `${post.thumb_url || ""}`.trim();
  if (!raw) return [];
  return raw
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Tăng view 1 lần duy nhất cho mỗi bài (lưu local, không gọi mạng). */
const VIEWED_KEY = "feedback_viewed_ids";
function readViewed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function useViewOnce(id: string): number {
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    const list = readViewed();
    if (list.includes(id)) return;
    try {
      localStorage.setItem(VIEWED_KEY, JSON.stringify([...list, id].slice(-500)));
    } catch {
      /* ignore */
    }
    setExtra(1);
  }, [id]);
  return extra;
}

function Rating({ value }: { value: number }) {
  return (
    <div className="fbd-rating" aria-label={`Đánh giá ${value} trên 5`}>
      <span className="fbd-rating__stars">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            size={16}
            fill={i + 0.5 <= value ? "currentColor" : "none"}
            className={i + 0.5 <= value ? "is-on" : ""}
          />
        ))}
      </span>
      <b>{value.toFixed(1)}</b>
      <span className="fbd-rating__max">/ 5</span>
    </div>
  );
}

function Carousel({ images, alt }: { images: string[]; alt: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }, []);

  return (
    <div className="fbd-media">
      <div className="fbd-media__track" ref={trackRef} onScroll={onScroll}>
        {images.map((src, i) => (
          <img key={`${src}-${i}`} src={src} alt={`${alt} ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
        ))}
      </div>
      <span className="fbd-media__badge">🔥 FEEDBACK VIP</span>
      {images.length > 1 ? (
        <div className="fbd-media__dots" aria-hidden>
          {images.map((_, i) => (
            <i key={i} className={i === active ? "is-on" : ""} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const FeedbackDetail = memo(function FeedbackDetail({
  post,
  onClose,
}: {
  post: FeedbackPost;
  onClose: () => void;
}) {
  const images = useMemo(() => imagesOf(post), [post]);
  const extraView = useViewOnce(post.id);
  const rating = Number(post.rating) || 5;
  const paragraphs = useMemo(
    () =>
      (post.content || post.excerpt || "")
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean),
    [post.content, post.excerpt],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <Portal>
      <div className="fbd-backdrop" onClick={onClose}>
        <article
          className="fbd-sheet"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={post.title}
        >
          <StickyBackHeader onBack={onClose} />

          {images.length ? <Carousel images={images} alt={post.title} /> : null}

          <div className="fbd-body">
            <h2 className="fbd-title">{post.title}</h2>
            <Rating value={rating} />
            <p className="fbd-tagline">Cảm nhận từ thành viên đã tham gia nhóm VIP</p>

            <div className="fbd-meta">
              <span className="fbd-meta__name">{post.author_name || "Ẩn danh"}</span>
              {post.area ? (
                <span className="fbd-meta__item">
                  <MapPin size={13} /> {post.area}
                </span>
              ) : null}
              <span className="fbd-meta__item">
                <CalendarDays size={13} /> {formatDate(post.published_at || post.created_at)}
              </span>
            </div>

            <div className="fbd-stats">
              <span className="fbd-stat fbd-stat--like">
                <Heart size={15} fill="currentColor" /> {formatCount(likeCountOf(post))}
              </span>
              <span className="fbd-stat">
                <Eye size={15} /> {formatCount(viewCountOf(post) + extraView)}
              </span>
            </div>

            <div className="fbd-content">
              {paragraphs.map((block, i) => (
                <p key={i}>
                  {block.split("\n").map((line, j, arr) => (
                    <span key={j}>
                      {line}
                      {j < arr.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          </div>
        </article>
      </div>
    </Portal>
  );
});

export default FeedbackDetail;
