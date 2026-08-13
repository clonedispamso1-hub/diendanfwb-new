import { useEffect, useMemo, useState, memo } from "react";
import { Eye, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isMissingRelationError } from "@/lib/db-compat";
import { formatCount, fakeVideoStats } from "@/lib/format";
import { useRealtime } from "@/lib/realtime-registry";

interface Props {
  videoId: string;
  createdAt?: string | null;
}

/** Đè ở góc dưới-phải video: 👁 view · ❤ tym */
function VideoStatsOverlayImpl({ videoId, createdAt }: Props) {
  const [likes, setLikes] = useState(0);
  const fake = useMemo(() => fakeVideoStats(videoId, createdAt), [videoId, createdAt]);

  const loadLikes = useMemo(() => () => {
    supabase
      .from("video_likes" as any)
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId)
      .then(({ count, error }) => {
        if (error && isMissingRelationError(error)) return setLikes(0);
        setLikes(count || 0);
      });
  }, [videoId]);

  useEffect(() => {
    void loadLikes();
  }, [loadLikes]);

  // Dùng chung key channel với VideoInteractions ("video-int-<id>") để không mở 2 socket
  // cho cùng 1 video — registry ref-count sẽ gộp lại thành 1 channel duy nhất.
  // topicIndex 0 = video_likes (thứ tự topics khai báo trong video-interactions.tsx).
  useRealtime(
    videoId ? `video-int-${videoId}` : null,
    [
      { table: "video_likes", filter: `video_id=eq.${videoId}` },
      { table: "video_comments", filter: `video_id=eq.${videoId}` },
      { table: "video_gifts", event: "INSERT", filter: `video_id=eq.${videoId}` },
    ],
    (_payload, topicIndex) => {
      if (topicIndex === 0) loadLikes();
    },
  );

  const displayedLikes = likes + (fake.active ? fake.likes : 0);
  const displayedViews = fake.active ? fake.views : 0;

  return (
    <div
      className="video-stats-row"
      style={{
        display: "inline-flex",
        gap: 16,
        alignItems: "center",
        padding: "6px 2px",
        color: "hsl(var(--muted-foreground))",
        fontSize: 13,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Eye size={14} /> {formatCount(displayedViews)} lượt xem
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Heart size={14} fill="#ef4444" color="#ef4444" /> {formatCount(displayedLikes)} lượt thích
      </span>
    </div>
  );
}

export const VideoStatsOverlay = memo(VideoStatsOverlayImpl);
