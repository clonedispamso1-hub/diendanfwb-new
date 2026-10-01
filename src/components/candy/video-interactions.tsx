import { useEffect, useState, memo } from "react";
import { Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { guardAction } from "@/lib/rate-limit";
import { isMissingRelationError } from "@/lib/db-compat";
import { useAuth } from "@/components/candy/auth-provider";
import { formatCount } from "@/lib/format";
import { useRealtime } from "@/lib/realtime-registry";

interface Props {
  videoId: string;
  ownerId: string;
  meId?: string;
  createdAt?: string | null;
  recipientName?: string;
  onViewProfile?: (userId: string) => void;
}

function VideoInteractionsImpl({ videoId, ownerId, meId, recipientName, onViewProfile }: Props) {
  const { refreshMe } = useAuth();
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [likeCount, myLike] = await Promise.all([
        supabase.from("video_likes" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId),
        meId
          ? supabase.from("video_likes" as any).select("id").eq("video_id", videoId).eq("user_id", meId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      if (likeCount.error && isMissingRelationError(likeCount.error)) {
        setLikes(0); setLiked(false); return;
      }
      setLikes(likeCount.count || 0);
      setLiked(Boolean((myLike as any).data));
    };
    void load();
    return () => { cancelled = true; };
  }, [videoId, meId]);

  // Một channel duy nhất (registry) cho likes của video này — có filter server-side.
  useRealtime(
    videoId ? `video-int-${videoId}` : null,
    [
      { table: "video_likes", filter: `video_id=eq.${videoId}` },
    ],
    (payload, topicIndex) => {
      if (topicIndex === 0) {
        supabase.from("video_likes" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId)
          .then(({ count }) => setLikes(count || 0));
      }
    },
  );

  const toggleLike = async () => {
    if (!meId) return alert("Vui lòng đăng nhập.");
    // Restriction gate — like actions may be blocked by admin.
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("like"))) return;
    }
    if (!(await guardAction("like"))) return;

    setLikeBurst((n) => n + 1);
    const { data: existing, error: checkErr } = await supabase
      .from("video_likes" as any)
      .select("id")
      .eq("video_id", videoId)
      .eq("user_id", meId)
      .maybeSingle();
    if (checkErr) { alert(checkErr.message); return; }
    const wasLiked = !!existing;
    setLiked(!wasLiked);
    setLikes((v) => Math.max(0, v + (wasLiked ? -1 : 1)));
    if (wasLiked) {
      const { error } = await supabase.from("video_likes" as any).delete()
        .eq("video_id", videoId).eq("user_id", meId);
      if (error) { setLiked(true); setLikes((v) => v + 1); alert(error.message); }
    } else {
      const { error } = await supabase.from("video_likes" as any)
        .upsert([{ video_id: videoId, user_id: meId }], {
          onConflict: "video_id,user_id",
          ignoreDuplicates: true,
        });
      if (error) { setLiked(false); setLikes((v) => Math.max(0, v - 1)); alert(error.message); }
    }
  };

  const displayedLikes = likes;

  return (
    <>
      <div className="post-actions reaction-bar" style={{ position: "relative" }}>
        <button
          className={`post-action reaction-btn reaction-like ${liked ? "is-active" : ""} ${likeBurst > 0 ? "reaction-press" : ""}`}
          key={`vlike-${likeBurst}`}
          onClick={() => void toggleLike()}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
          <span className="reaction-label">Thích</span>
          <span className="reaction-count">{formatCount(displayedLikes)}</span>
          {likeBurst > 0 ? (
            <>
              <span className="like-floater lf-1" aria-hidden="true"><Heart size={12} fill="currentColor" /></span>
              <span className="like-floater lf-2" aria-hidden="true"><Heart size={14} fill="currentColor" /></span>
              <span className="like-floater lf-3" aria-hidden="true"><Heart size={12} fill="currentColor" /></span>
              <span className="like-plus-one" aria-hidden="true">+1</span>
            </>
          ) : null}
        </button>
      </div>

    </>
  );
}

export const VideoInteractions = memo(VideoInteractionsImpl);
