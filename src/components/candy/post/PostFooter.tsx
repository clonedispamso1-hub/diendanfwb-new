import { Lock } from "lucide-react";
import { ReactionBar } from "./ReactionBar";
import { GiftedChip } from "./GiftedChip";
import { usePostCard } from "./post-card-context";

/**
 * PostFooter — lock banner + reaction bar + chip "🎁 Được tặng" (realtime).
 */
export function PostFooter() {
  const { isLocked, lockedReason } = usePostCard();
  return (
    <div className="pc-footer">
      {isLocked ? (
        <div className="pc-lock-banner" role="alert">
          <Lock size={14} />
          <span>
            Bài viết đã bị khóa bởi quản trị viên{lockedReason ? ` — ${lockedReason}` : "."}
          </span>
        </div>
      ) : null}
      <GiftedChip />
      <ReactionBar />
    </div>
  );
}
