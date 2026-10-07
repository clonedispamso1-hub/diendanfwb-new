import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/format";
import { toast } from "sonner";
import { usePostCard } from "./post-card-context";

/**
 * LikeButton — tap to like. Shows a coral heart burst + floating hearts +
 * "+1" pip on activation.
 *
 * Số tym hiển thị = số dòng thật trong bảng likes.
 *
 * UI like: button luôn giữ nền trắng/nhạt + border nhẹ. "Đã like" chỉ khác ở
 * trái tim đỏ đặc (fill = currentColor) — không tô đỏ cả button.
 * `pulse` dưới đây thuần thị giác, không đụng logic like/unlike.
 */
export function LikeButton() {
  const { liked, likeBurst, likes, likeCooldownUntil, isLocked, toggleLike } =
    usePostCard();

  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Nhịp pulse nhẹ trên trái tim mỗi lần bấm (Like hoặc Unlike).
  const [pulse, setPulse] = useState(0);
  const pulseTimer = useRef<number | null>(null);
  const firePulse = () => {
    setPulse((n) => n + 1);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(0), 500);
  };
  useEffect(
    () => () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    },
    [],
  );

  const onClick = () => {
    if (isLocked) { toast.error("Bài viết đã bị khóa."); return; }
    firePulse();
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
      <span
        key={`pc-like-pulse-${pulse}`}
        className={`pc-action-icon ${pulse > 0 ? "is-pulsing" : ""}`}
      >
        <Heart size={20} fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
      </span>
      <span className="pc-action-count">{formatCount(likes)}</span>
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
