import { LikeButton } from "./LikeButton";
import { CommentButton } from "./CommentButton";
import { GiftButton } from "./GiftButton";
import { ViewCounter } from "./ViewCounter";

/**
 * ReactionBar — ❤️ Like · 💬 Bình luận · 🎁 Tặng quà · 👁 Lượt xem.
 */
export function ReactionBar() {
  return (
    <div className="pc-reactions" role="group" aria-label="Tương tác">
      <LikeButton />
      <CommentButton />
      <GiftButton />
      <ViewCounter />
    </div>
  );
}
