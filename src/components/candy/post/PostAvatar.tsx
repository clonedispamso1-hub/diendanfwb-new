import { Heart } from "lucide-react";
import { IntentBubble } from "@/components/candy/intent-bubble";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { usePostCard } from "./post-card-context";

/**
 * PostAvatar — round author avatar with optional story ring, intent bubble,
 * VIP tinting on the border, and a compact follow toggle at the bottom-right.
 * Presentational only: interactions are wired through the PostCard context.
 */
export function PostAvatar() {
  const {
    post, isAnonymous, hasStory, meId, following, authorName, quickFollow,
  } = usePostCard();

  const vipTint = !isAnonymous && Math.max(1, post.profiles?.vip_level || 1) >= 2 ? "gold" : "plain";

  return (
    <span className={`pc-avatar-wrap${!isAnonymous && hasStory ? " has-story" : ""}`}>
      <span className="pc-avatar-ring" data-vip={vipTint}>
        {!isAnonymous ? (
          <IntentBubble
            userId={post.user_id}
            initialIntent={(post.profiles as any)?.intent}
            size="sm"
          />
        ) : null}
        <AvatarGlow
          avatar={isAnonymous ? null : post.profiles?.avatar ?? null}
          userId={isAnonymous ? null : post.user_id}
          size={38}
          alt={authorName}
          imgClassName="pc-avatar-img"
        />
      </span>
      {!isAnonymous && meId && meId !== post.user_id ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={following ? "Đã yêu thích" : "Yêu thích nhanh"}
          onClick={quickFollow}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") quickFollow(e); }}
          className="pc-avatar-follow"
          data-following={following ? "1" : "0"}
          title={following ? "Bấm để bỏ yêu thích" : "Yêu thích"}
        >
          <Heart size={11} strokeWidth={2.6} fill={following ? "currentColor" : "none"} />
        </span>
      ) : null}
    </span>
  );
}
