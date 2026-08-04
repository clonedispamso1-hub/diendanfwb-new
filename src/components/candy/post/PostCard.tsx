import { memo, useEffect, useRef } from "react";
import type { PostRecord } from "@/lib/app-types";
import { ReportPostModal } from "@/components/candy/report-post-modal";
import { DragonBallGiftPanel } from "@/components/candy/gift/dragon-ball-gift-panel";
import { GiftHistoryModal } from "@/components/candy/gift-history-modal";
import { CommentSheet } from "@/components/candy/comment-sheet";

import { PostCardProvider } from "./post-card-context";
import { usePostCardState } from "./use-post-card-state";
import { PostHeader } from "./PostHeader";
import { PostBody } from "./PostBody";
import { PostFooter } from "./PostFooter";
import {
  PostCategoryLabel,
  usePostCategoryInfo,
  type FeedSurface,
} from "./PostCategoryHeader";

export interface PostCardProps {
  meId?: string;
  post: PostRecord;
  canDelete?: boolean;
  onRefresh: () => void;
  onRemoved?: (postId: string) => void;
  onViewProfile: (userId: string) => void;
  compactMedia?: boolean;
  /** Backward-compat prop — visual layout is identical everywhere. */
  variant?: "default" | "profile";
  /**
   * Where this card is rendered. Controls the classification banner
   * (Trang Chủ / Quan trọng / Admin / Top / Thành viên mới). Default "none"
   * means no banner (used on profile & post-detail).
   */
  feedSurface?: FeedSurface;
}

/**
 * PostCard — shared card for Feed, Profile, and Post Detail.
 * Composition: <PostHeader/> · <PostBody/> · <PostFooter/> + modals.
 *
 * NOTE: variant is accepted but visually ignored on purpose. Feed & Profile
 * must be pixel-identical per the design system contract.
 */
function PostCardImpl(props: PostCardProps) {
  const ctx = usePostCardState(props);
  const {
    post, authorName, reportOpen, setReportOpen, giftMenuOpen, setGiftMenuOpen,
    giftHistoryOpen, setGiftHistoryOpen, openComments, setOpenComments,
    setTotalGifted, setShowGiftBurst, onViewProfile, totalGifted, categoryMeta,
    pinnedActive, featuredActive, trackView,
  } = ctx;

  const dataStates = [
    pinnedActive ? "pinned" : null,
    featuredActive ? "featured" : null,
  ].filter(Boolean).join(" ");

  // PHẦN 5 — View count thật: chỉ tính view khi article thực sự hiện trong
  // viewport ≥ 50% liên tục 1.2s. Dedup phía server bằng UNIQUE(post_id,user_id).
  const articleRef = useRef<HTMLElement | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const trackedRef = useRef(false);
  useEffect(() => {
    const el = articleRef.current;
    if (!el || trackedRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (dwellTimerRef.current == null) {
            dwellTimerRef.current = window.setTimeout(() => {
              trackedRef.current = true;
              void trackView();
              io.disconnect();
            }, 1200);
          }
        } else if (dwellTimerRef.current != null) {
          window.clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = null;
        }
      }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => {
      io.disconnect();
      if (dwellTimerRef.current != null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };
  }, [trackView, post.id]);

  const feedSurface: FeedSurface = props.feedSurface ?? "none";
  const categoryInfo = usePostCategoryInfo(post, feedSurface);
  const ledKind = categoryInfo?.kind ?? "home";

  return (
    <PostCardProvider value={ctx}>
      <div
        className="pc-post-block"
        data-surface={feedSurface}
        data-category-kind={categoryInfo?.kind ?? "none"}
      >
        {categoryInfo ? <PostCategoryLabel info={categoryInfo} /> : null}
        <article
          ref={articleRef}
          id={`post-${post.id}`}
          className="pc-card"
          data-states={dataStates || undefined}
          data-category={categoryMeta?.label.toLowerCase() || undefined}
          data-surface={feedSurface}
          data-led-kind={ledKind}
        >
          <span className="pc-card__led" aria-hidden />

          <PostHeader />
          <PostBody />
          <PostFooter />


          <ReportPostModal
            open={reportOpen}
            postId={post.id}
            postOwnerId={post.user_id}
            onClose={() => setReportOpen(false)}
          />

          <DragonBallGiftPanel
            open={giftMenuOpen && Boolean(post?.id) && Boolean(post?.user_id)}
            onClose={() => setGiftMenuOpen(false)}
            postId={post?.id ?? ""}
            receiverId={post?.user_id ?? ""}
            receiverName={authorName}
            onSent={(b) => {
              setTotalGifted((v) => v + b.amount);
              setShowGiftBurst(true);
              window.setTimeout(() => setShowGiftBurst(false), 700);
            }}
          />

          <CommentSheet
            open={openComments}
            postId={post.id}
            onClose={() => setOpenComments(false)}
            onViewProfile={onViewProfile}
          />

          {giftHistoryOpen ? (
            <GiftHistoryModal
              postId={post.id}
              totalGifted={totalGifted}
              onClose={() => setGiftHistoryOpen(false)}
              onViewProfile={(uid) => { setGiftHistoryOpen(false); onViewProfile(uid); }}
            />
          ) : null}
        </article>
      </div>
    </PostCardProvider>
  );
}

export const PostCard = memo(PostCardImpl, (prev, next) => {
  return (
    prev.meId === next.meId &&
    prev.canDelete === next.canDelete &&
    prev.post.id === next.post.id &&
    prev.post.content === next.post.content &&
    prev.post.image_url === next.post.image_url &&
    prev.feedSurface === next.feedSurface &&
    prev.onRefresh === next.onRefresh &&
    prev.onViewProfile === next.onViewProfile
  );
});
