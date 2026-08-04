import { LikeButton } from "./LikeButton";
import { CommentButton } from "./CommentButton";
import { ViewCounter } from "./ViewCounter";

/**
 * ReactionBar — Like · Comment · Views. Gift đã bị gỡ bỏ.
 */
export function ReactionBar() {
  return (
    <div className="pc-reactions" role="group" aria-label="Tương tác">
      <LikeButton />
      <CommentButton />
      <ViewCounter />
    </div>
  );
}
