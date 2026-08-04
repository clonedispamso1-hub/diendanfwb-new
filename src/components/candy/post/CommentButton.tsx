import { MessageCircle } from "lucide-react";
import { formatCount } from "@/lib/format";
import { usePostCard } from "./post-card-context";

/**
 * CommentButton — feed usage opens the bottom-sheet / popup composer.
 * When rendered inside the dedicated Post Detail page (`/post/:id`) the
 * composer is already inline, so instead of opening a popup we scroll the
 * composer into view and focus its input via a custom event that
 * `CommentComposer` listens for.
 */
export function CommentButton() {
  const { commentBurst, comments, setCommentBurst, setOpenComments } = usePostCard();

  const isInDetailPage = () =>
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/post/");

  return (
    <button
      type="button"
      className={`pc-action pc-comment ${commentBurst > 0 ? "is-pop" : ""}`}
      key={`cmt-${commentBurst}`}
      data-action="open-comments"
      onClick={() => {
        setCommentBurst((n) => n + 1);
        if (isInDetailPage()) {
          try {
            window.dispatchEvent(new CustomEvent("pd-focus-composer"));
          } catch { /* noop */ }
          return;
        }
        setOpenComments(true);
      }}
      aria-label="Bình luận"
    >
      <span className="pc-action-icon">
        <MessageCircle size={20} strokeWidth={2.2} />
      </span>
      <span className="pc-action-count">{formatCount(comments)}</span>
      {commentBurst > 0 ? <span className="pc-comment-ripple" aria-hidden /> : null}
    </button>
  );
}
