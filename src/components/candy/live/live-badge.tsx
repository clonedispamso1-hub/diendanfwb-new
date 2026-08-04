/**
 * Badge 🔴 LIVE — viên thuốc nhỏ ở góc dưới bên phải avatar.
 * Bấm vào → mở tab Live Móc 🦋 và cuộn tới đúng phòng của người đó.
 * Hiệu ứng cực nhẹ: 1 chấm đỏ nhấp nháy + glow mờ (CSS thuần).
 */
import "@/components/candy/live/live-badge.css";
import { openLiveRoom, useIsUserLive } from "@/lib/live-presence";

export function LiveBadge({ userId, size = "sm" }: { userId?: string | null; size?: "sm" | "md" }) {
  const roomId = useIsUserLive(userId);
  if (!roomId) return null;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Đang Live — bấm để xem"
      aria-label="Đang Live"
      className={`live-badge live-badge--${size}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openLiveRoom(roomId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          openLiveRoom(roomId);
        }
      }}
    >
      <i className="live-badge__dot" />
      LIVE
    </span>
  );
}

export default LiveBadge;