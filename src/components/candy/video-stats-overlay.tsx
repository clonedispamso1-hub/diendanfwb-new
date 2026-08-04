import { useEffect, useMemo, useState } from "react";
import { Eye, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isMissingRelationError } from "@/lib/db-compat";
import { formatCount, fakeVideoStats } from "@/lib/format";

interface Props {
  videoId: string;
  createdAt?: string | null;
}

/** Đè ở góc dưới-phải video: 👁 view · ❤ tym */
export function VideoStatsOverlay({ videoId, createdAt }: Props) {
  const [likes, setLikes] = useState(0);
  const fake = useMemo(() => fakeVideoStats(videoId, createdAt), [videoId, createdAt]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { count, error } = await supabase
        .from("video_likes" as any)
        .select("*", { count: "exact", head: true })
        .eq("video_id", videoId);
      if (cancelled) return;
      if (error && isMissingRelationError(error)) return setLikes(0);
      setLikes(count || 0);
    };
    void load();
    const ch = supabase
      .channel(`video-stats-${videoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_likes", filter: `video_id=eq.${videoId}` },
        () => {
          supabase
            .from("video_likes" as any)
            .select("*", { count: "exact", head: true })
            .eq("video_id", videoId)
            .then(({ count }) => setLikes(count || 0));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [videoId]);

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
