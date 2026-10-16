import { Lock } from "lucide-react";
import { ReactionBar } from "./ReactionBar";
import { usePostCard } from "./post-card-context";

/**
 * PostFooter — lock banner + reaction bar.
 * Phần bình luận dưới bài viết đã được gỡ khỏi giao diện theo yêu cầu:
 * component PostComments không còn được render ở bất kỳ đâu trong app
 * (không ảnh hưởng dữ liệu bình luận trong DB).
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
      <ReactionBar />
    </div>
  );
}
