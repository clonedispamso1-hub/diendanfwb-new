import { getValidAvatarUrl } from "@/lib/avatar-utils";
import { supabase } from "@/lib/supabase";
import { PostMedia } from "@/components/candy/post-media";
import { usePostCard } from "./post-card-context";

/**
 * PostMediaBlock — media gallery (images / video) rendered through the
 * existing PostMedia primitive with a legacy overlay payload composed here
 * so the underlying media renderer keeps working unchanged.
 */
export function PostMediaBlock() {
  const {
    post, images, compactMedia, isAnonymous, liked, likes, botLikes, comments,
    totalGifted, viewCount, isLocked, meId, toggleLike, setOpenComments,
    setGiftMenuOpen, setReportOpen, onRefresh, onRemoved,
  } = usePostCard();

  if (!images.length) return null;

  const authorName = post.profiles?.full_name || "Người dùng";

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
          comments,
          gifts: totalGifted,
          views: viewCount,
          onToggleLike: () => {
            if (isLocked) return;
            void toggleLike();
          },
          onOpenComments: () => {
            if (typeof window !== "undefined" && window.location.pathname.startsWith("/post/")) {
              try { window.dispatchEvent(new CustomEvent("pd-focus-composer")); } catch { /* noop */ }
              return;
            }
            setOpenComments(true);
          },
          onOpenGift: () => {
            if (isLocked) return;
            if (!post?.id || !post?.user_id) return;
            setGiftMenuOpen(true);
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
