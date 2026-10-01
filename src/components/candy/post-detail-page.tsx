import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { read3 } from "@/lib/content-db";
import { fetchProfileById, PROFILE_POST_COLS } from "@/lib/profile-cache";

/* =========================================================================
 * Post Detail Page — hiển thị 1 bài viết toàn màn hình.
 * (Tính năng bình luận đã được gỡ bỏ hoàn toàn.)
 * ========================================================================= */

const POST_COLUMNS =
  "id, user_id, content, image_url, likes_count, created_at, image_urls, visibility, status, has_images, virtual_view_base, category, display_view_offset, is_anonymous, bot_likes, is_edited, post_code, pin_until, is_locked, priority_new, bumped_at, is_pinned, is_hidden, priority_level, pinned_until, locked_at, locked_reason, priority_until, is_featured, featured_until, coin_pool_total, coin_pool_remaining, max_claimers, claimed_count, coin_per_person, reward_enabled, reward_mode, views_count, is_deleted, is_admin_post, admin_priority, is_popup, relationship_type, facebook_url, zalo_url, gif_url, pinned_at, deleted_at, deleted_by, delete_reason";

export function PostDetailPage({
  postId,
  onViewProfile,
}: {
  postId: string;
  onViewProfile?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = useCallback(() => {
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else if (typeof window !== "undefined" && window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [location.key, navigate]);
  const { me } = useAuth();
  const params = useParams();
  const routePostId = (params as { postId?: string }).postId;
  const effectivePostId = postId || routePostId || "";

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const handleViewProfile = useCallback(
    (id: string) => {
      if (onViewProfile) onViewProfile(id);
      else navigate(`/profile/${id}`);
    },
    [navigate, onViewProfile],
  );

  useEffect(() => {
    if (!effectivePostId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: p, error } = await read3()
        .from("posts")
        .select(POST_COLUMNS)
        .is("deleted_at", null)
        .eq("id", effectivePostId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !p) {
        setPost(null);
        setLoading(false);
        return;
      }
      const profile: any = p.user_id ? await fetchProfileById(p.user_id, PROFILE_POST_COLS) : null;
      if (cancelled) return;
      setPost({ ...p, profiles: profile });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectivePostId]);

  return (
    <div className="pd-page" style={{ display: "flex", flexDirection: "column", background: "hsl(var(--background))" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "hsl(var(--card) / 0.92)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Quay lại"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: 0,
            background: "hsl(var(--muted))",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "hsl(var(--foreground))",
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "hsl(var(--foreground))" }}>
          Chi tiết bài viết
        </h1>
      </div>

      <div style={{ paddingBottom: 8 }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            <Loader2 size={24} className="animate-spin" style={{ display: "inline-block" }} />
            <p style={{ marginTop: 12, fontSize: "0.9rem" }}>Đang tải bài viết...</p>
          </div>
        ) : !post ? (
          <div style={{ padding: 60, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            <p style={{ fontSize: "0.95rem" }}>Bài viết không tồn tại hoặc đã bị xóa.</p>
            <button
              onClick={() => navigate("/")}
              style={{
                marginTop: 14,
                padding: "8px 18px",
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Về trang chủ
            </button>
          </div>
        ) : (
          <div className="feed-threads" style={{ padding: "12px 12px 4px" }}>
            <PostCard
              meId={me?.id}
              post={post}
              onRefresh={() => {
                if (!effectivePostId) return;
                void read3()
                  .from("posts")
                  .select(POST_COLUMNS)
                  .eq("id", effectivePostId)
                  .maybeSingle()
                  .then(({ data: p }: { data: any }) => {
                    if (p) setPost((prev: any) => ({ ...(prev || {}), ...p }));
                  });
              }}
              onViewProfile={handleViewProfile}
              canDelete={me?.id === post.user_id}
              compactMedia
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PostDetailPage;
