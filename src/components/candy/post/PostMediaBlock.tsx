import { getValidAvatarUrl } from "@/lib/avatar-utils";
import { supabase } from "@/lib/supabase";
import { PostMedia } from "@/components/candy/post-media";
import { usePostCard } from "./post-card-context";
import { resolveUserName } from "@/lib/user-name";

/**
 * PostMediaBlock — media gallery (images / video) rendered through the
 * existing PostMedia primitive with a legacy overlay payload composed here
 * so the underlying media renderer keeps working unchanged.
 */
export function PostMediaBlock() {
  const {
    post, images, compactMedia, isAnonymous, liked, likes, botLikes,
    viewCount, isLocked, meId, toggleLike,
    setReportOpen, onRefresh, onRemoved,
  } = usePostCard();

  if (!images.length) return null;

  const authorName = resolveUserName(post.profiles as any, "Người dùng");

  return (
    <div className="pc-media">
      <PostMedia
        urls={images}
        alt={post.content || "Media bài viết"}
        compact={compactMedia}
        overlay={{
          authorName: isAnonymous ? "Người dùng ẩn danh" : authorName,
          authorAvatar: isAnonymous
            ? getValidAvatarUrl(null)
            : getValidAvatarUrl(post.profiles?.avatar),
          liked,
          likes: likes + botLikes,
          views: viewCount,
          onToggleLike: () => {
            if (isLocked) return;
            void toggleLike();
          },
          postId: post.id,
          ownerId: post.user_id,
          meId: meId ?? null,
          onDeletePost: async () => {
            const { error } = await supabase.from("posts").delete().eq("id", post.id);
            if (error) throw error;
            onRemoved?.(post.id);
            onRefresh();
          },
          onReportPost: () => setReportOpen(true),
        }}
      />
    </div>
  );
}
