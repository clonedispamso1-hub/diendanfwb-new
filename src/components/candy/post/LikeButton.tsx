import { useRef } from "react";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/format";
import { toast } from "sonner";
import { usePostCard } from "./post-card-context";
import { useAutoLikes } from "@/hooks/use-auto-likes";

/**
 * LikeButton — tap to like. Shows a coral heart burst + floating hearts +
 * "+1" pip on activation.
 *
 * Ngoài like thật, nút còn "đuổi" số tim từ DB: hiển thị thấp hơn target rồi
 * tự đếm lên từng nấc kèm hiệu ứng "❤️ +1" bay lên (CSS animation, 0.9s).
 * Chỉ chạy khi nút nằm trong viewport → không tốn FPS.
 */
export function LikeButton() {
  const { post, liked, likeBurst, likes, botLikes, likeCooldownUntil, isLocked, toggleLike } =
    usePostCard();

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const auto = useAutoLikes(
    post.id,
    {
      base: botLikes,
      createdAt: (post as any).created_at ?? null,
      isAdmin:
        Boolean((post as any).is_admin_post) || Boolean((post as any).profiles?.is_admin),
    },
    btnRef,
  );

  const onClick = () => {
    if (isLocked) { toast.error("Bài viết đã bị khóa."); return; }
    toggleLike();
  };
  const disabled = isLocked || likeCooldownUntil > Date.now();

  return (
    <button
      ref={btnRef}
      type="button"
      className={`pc-action pc-like ${liked ? "is-active" : ""} ${likeBurst > 0 ? "is-burst" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label="Thích"
      aria-pressed={liked}
    >
      <span className="pc-action-icon">
        <Heart size={20} fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
      </span>
      <span className="pc-action-count">{formatCount(likes + auto.count)}</span>
      {likeBurst > 0 ? (
        <>
          <span className="pc-like-burst" aria-hidden><Heart size={14} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--1" aria-hidden><Heart size={12} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--2" aria-hidden><Heart size={14} fill="currentColor" /></span>
          <span className="pc-like-float pc-like-float--3" aria-hidden><Heart size={12} fill="currentColor" /></span>
          <span className="pc-like-plusone" aria-hidden>+1</span>
        </>
      ) : null}
      {likeBurst === 0 && auto.pulseId > 0 ? (
        <span className="pc-like-plusone pc-like-auto" key={`auto-${auto.pulseId}`} aria-hidden>
          ❤️ +{Math.max(1, auto.delta)}
        </span>
      ) : null}
    </button>
  );
}
