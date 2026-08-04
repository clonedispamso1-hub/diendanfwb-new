import { Heart } from "lucide-react";
import { formatCount } from "@/lib/format";
import { toast } from "sonner";
import { usePostCard } from "./post-card-context";

/**
 * LikeButton — tap to like. Shows a coral heart burst + floating hearts +
 * "+1" pip on activation. Disabled during global anti-spam cooldown and
 * when the post is locked. Numbers use tabular-nums for stable spacing.
 */
export function LikeButton() {
  const { liked, likeBurst, likes, botLikes, likeCooldownUntil, isLocked, toggleLike } =
    usePostCard();

  const onClick = () => {
    if (isLocked) { toast.error("Bài viết đã bị khóa."); return; }
    toggleLike();
  };
  const disabled = isLocked || likeCooldownUntil > Date.now();

  return (
    <button
      type="button"
      className={`pc-action pc-like ${liked ? "is-active" : ""} ${likeBurst > 0 ? "is-burst" : ""}`}
      key={`like-${likeBurst}`}
      onClick={onClick}
      disabled={disabled}
      aria-label="Thích"
      aria-pressed={liked}
    >
      <span className="pc-action-icon">
        <Heart size={20} fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
      </span>
      <span className="pc-action-count">{formatCount(likes + botLikes)}</span>
      {likeBurst > 0 ? (
        <>
          <span className="pc-like-burst" aria-hidden><Heart size={14} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--1" aria-hidden><Heart size={12} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--2" aria-hidden><Heart size={14} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--3" aria-hidden><Heart size={12} fill="currentColor" /></span>
          <span className="pc-like-plusone" aria-hidden>+1</span>
        </>
      ) : null}
    </button>
  );
}
