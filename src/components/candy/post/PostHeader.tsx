import { PostAvatar } from "./PostAvatar";
import { PostMeta } from "./PostMeta";
import { PostMenu } from "./PostMenu";
import { usePostCard } from "./post-card-context";

/**
 * PostHeader — top row of the card. Left: avatar + name/meta trigger,
 * clickable to open the author's profile. Right: three-dot menu.
 */
export function PostHeader() {
  const { onViewProfile, post, isAnonymous } = usePostCard();
  return (
    <div className="pc-header">
      <button
        type="button"
        className="pc-header-author"
        onClick={() => { if (!isAnonymous) onViewProfile(post.user_id); }}
        disabled={isAnonymous}
        style={isAnonymous ? { cursor: "default" } : undefined}
      >
        <PostAvatar />
        <PostMeta />
      </button>
      <PostMenu />
    </div>
  );
}
