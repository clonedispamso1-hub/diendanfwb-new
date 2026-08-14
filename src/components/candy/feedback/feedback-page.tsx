/**
 * FEEDBACK — blog dạng Facebook/Threads.
 * Danh sách: thumbnail 480px, lazy-load, pagination, cache 5 phút.
 * Chi tiết: mở overlay có animation, LÚC ĐÓ mới tải ảnh 720px.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Heart, Star, MapPin } from "lucide-react";
import { FeedbackDetail } from "./feedback-detail";
import { useAuth } from "@/components/candy/auth-provider";
import {
  FEEDBACK_STALE_MS,
  fetchFeedbackPublished,
  formatCount,
  likeCountOf,
  markFeedbackSeen,
  useBuffTick,
  viewCountOf,
  type FeedbackPost,
} from "@/lib/feedback";
import "./feedback.css";

function Stars({ value }: { value: number }) {
  return (
    <span className="fb-stars" aria-label={`Đánh giá ${value}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={13}
          className={i + 0.5 <= value ? "is-on" : ""}
          fill={i + 0.5 <= value ? "currentColor" : "none"}
        />
      ))}
      <b>{value.toFixed(1)}</b>
    </span>
  );
}

function Metrics({ post }: { post: FeedbackPost }) {
  return (
    <div className="fb-metrics">
      <span className="fb-metric fb-metric--like">
        <Heart size={14} fill="currentColor" /> {formatCount(likeCountOf(post))}
      </span>
      <span className="fb-metric">
        <Eye size={14} /> {formatCount(viewCountOf(post))}
      </span>
      <Stars value={Number(post.rating) || 5} />
    </div>
  );
}

function FeedbackCard({
  post,
  index,
  onOpen,
}: {
  post: FeedbackPost;
  index: number;
  onOpen: () => void;
}) {
  const thumb = post.thumb_url || post.image_url;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut", delay: Math.min(index * 0.06, 0.3) }}
      className="fb-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      {thumb ? (
        <div className="fb-card__media">
          <img src={thumb} alt={post.title} loading="lazy" decoding="async" />
          <span className="fb-card__ribbon">🔥 FEEDBACK VIP</span>
        </div>
      ) : null}
      <div className="fb-card__body">
        <h3 className="fb-card__title">{post.title}</h3>
        <p className="fb-card__meta">
          <span className="fb-card__name">{post.author_name || "Ẩn danh"}</span>
          {post.area ? (
            <span className="fb-card__area">
              <MapPin size={12} /> {post.area}
            </span>
          ) : null}
        </p>
        {post.excerpt ? <p className="fb-card__excerpt">{post.excerpt}</p> : null}
        <Metrics post={post} />
        <span className="fb-card__cta">Đọc ngay →</span>
      </div>
    </motion.article>
  );
}

// Chi tiết bài viết (blog-style) tách sang feedback-detail.tsx


export function FeedbackPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { me } = useAuth();
  useBuffTick();

  // 1 query duy nhất, lấy TOÀN BỘ bài đã publish (published_at DESC).
  const query = useQuery({
    queryKey: ["feedback", "list"],
    queryFn: fetchFeedbackPublished,
    staleTime: FEEDBACK_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const posts = useMemo<FeedbackPost[]>(() => query.data ?? [], [query.data]);

  // Mở tab Feedback = đã xem → badge tự mất.
  useEffect(() => {
    markFeedbackSeen(posts[0]?.published_at, me?.id ?? null);
  }, [posts, me?.id]);

  const open = useCallback((id: string) => setOpenId(id), []);
  const current = posts.find((p) => p.id === openId) || null;

  return (
    <div className="fb-page">
      <header className="fb-page__head">
        <h1>⭐ Feedback</h1>
        <p>Cảm nhận thật từ thành viên</p>
      </header>

      {query.isLoading ? (
        <div className="fb-skeletons">
          {[0, 1, 2].map((i) => (
            <div key={i} className="fb-skeleton" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="fb-empty">Chưa có feedback nào.</p>
      ) : (
        <div className="fb-list" data-testid="fb-list" data-count={posts.length}>
          {posts.map((p, i) => (
            <FeedbackCard key={p.id} post={p} index={i} onOpen={() => open(p.id)} />
          ))}
        </div>
      )}


      <AnimatePresence>
        {current ? <FeedbackDetail post={current} onClose={() => setOpenId(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

export default FeedbackPage;
