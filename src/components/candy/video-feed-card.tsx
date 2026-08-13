import { memo, useEffect, useState } from "react";
import { Trash2, X, MapPin, Play, Eye, MoreHorizontal, Flag } from "lucide-react";
import { toast } from "sonner";
import { submitReport } from "@/services/reports-v2.service";
import { supabase } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/time-format";
import { VideoInteractions } from "@/components/candy/video-interactions";
import UniversalBadge from "@/components/candy/universal-badge";
import { GenderIcon } from "@/components/candy/gender-icon";
import { IntentBubble } from "@/components/candy/intent-bubble";
import { Portal } from "@/components/candy/portal";
import { useAuth } from "@/components/candy/auth-provider";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";

export interface VideoFeedRow {
  id: string;
  user_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    username: string | null;
    avatar: string | null;
    vip_level?: number | null;
    title_gif_url?: string | null;
    gender?: string | null;
    province?: string | null;
    location?: string | null;
    intent?: string | null;
  } | null;
}

interface Props {
  meId?: string;
  video: VideoFeedRow;
  onRefresh: () => void;
  onRemoved?: (videoId: string) => void;
  onViewProfile: (userId: string) => void;
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith("blob:");
}

function VideoFeedCardImpl({ meId, video: v, onRefresh, onRemoved, onViewProfile }: Props) {
  const { isAdmin } = useAuth();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwn = meId === v.user_id;
  const direct = isDirectVideoFile(v.video_url);
  const p = v.profiles;
  const authorName = p?.full_name || "Người dùng";
  const authorLocation = p?.province || p?.location || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("video_views" as any)
        .select("id", { count: "exact", head: true })
        .eq("video_id", v.id);
      if (!cancelled) setViewCount(count || 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [v.id]);

  const trackView = async () => {
    if (!meId) return;
    const { error } = await supabase
      .from("video_views" as any)
      .upsert({ video_id: v.id, user_id: meId } as any, {
        onConflict: "video_id,user_id",
        ignoreDuplicates: true,
      });
    if (!error) {
      const { count } = await supabase
        .from("video_views" as any)
        .select("id", { count: "exact", head: true })
        .eq("video_id", v.id);
      setViewCount(count || 0);
    }
  };

  const removeVideo = async () => {
    setMenuOpen(false);
    if (!window.confirm("Bạn muốn xóa video này?")) return;
    const { error } = await supabase.from("videos_social" as any).delete().eq("id", v.id);
    if (error) return alert(error.message);
    onRemoved?.(v.id);
    onRefresh();
  };

  const adminRemoveVideo = async () => {
    setMenuOpen(false);
    if (!window.confirm("Bạn chắc chắn muốn xóa bài viết này với tư cách Admin chứ?")) return;
    const { error } = await supabase.from("videos_social" as any).delete().eq("id", v.id);
    if (error) {
      toast.error(error.message || "Không thể xóa video.");
      return;
    }
    toast.success("Đã gỡ bỏ bài đăng thành công!");
    onRemoved?.(v.id);
    onRefresh();
  };

  const reportVideo = async () => {
    setMenuOpen(false);
    if (!meId) return alert("Vui lòng đăng nhập.");
    const reason = window.prompt("Lý do tố cáo video này?");
    if (!reason || !reason.trim()) return;
    try {
      await submitReport({
        kind: "posts",
        reporterId: meId,
        reportedUserId: v.user_id,
        targetId: v.id,
        reason: reason.trim(),
        detail: "video",
      });
    } catch (e: any) {
      toast.error(e?.message || "Không thể gửi tố cáo.");
      return;
    }
    toast.success("Đã gửi tố cáo.");
  };

  return (
    <article
      id={`video-${v.id}`}
      className="post-card !rounded-none !border-0 !shadow-none !bg-transparent"
      style={{
        position: "relative",
        background: "transparent",
        border: "none",
        boxShadow: "none",
        borderRadius: 0,
        borderBottom: "1px solid rgba(63, 63, 70, 0.6)",
        marginBottom: 0,
        padding: "14px 16px 12px",
      }}
    >
      <span
        className="post-view-corner"
        title="Lượt xem"
        aria-label={`${viewCount.toLocaleString()} lượt xem`}
      >
        <Eye size={14} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {viewCount.toLocaleString()}
        </span>
      </span>
      <div className="post-card-header">
        <button className="post-author" onClick={() => onViewProfile(v.user_id)}>
          <span className="post-avatar-wrap" style={{ position: "relative", display: "inline-block" }}>
            <IntentBubble userId={v.user_id} initialIntent={p?.intent as any} size="sm" />
            <img loading="lazy" decoding="async"
              className="avatar-md post-avatar"
              src={getValidAvatarUrl(p?.avatar)}
              onError={handleAvatarError}
              alt={authorName}
              data-vip={Math.max(1, p?.vip_level || 1) >= 2 ? "gold" : "white"}
            />
          </span>
          <div className="post-author-info text-left">
            <div className="post-author-main">
              <span className="row-title">{authorName}</span>
              <GenderIcon gender={p?.gender as any} />
              {authorLocation ? (
                <span className="post-author-loc" title={authorLocation}>
                  <MapPin size={12} aria-hidden="true" /> {authorLocation}
                </span>
              ) : null}
              <UniversalBadge profile={p as any} />
            </div>
            <div
              className="post-author-time"
              style={{
                fontSize: "0.78rem",
                color: "hsl(var(--muted-foreground))",
                fontVariantNumeric: "tabular-nums",
                marginTop: 2,
              }}
            >
              {formatRelativeTime(v.created_at)}
            </div>
          </div>
        </button>
        <div className="post-menu-wrap">
          <button
            className="icon-button post-menu-trigger"
            onClick={() => setMenuOpen((x) => !x)}
            aria-label="Tuỳ chọn"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen ? (
            <>
              <div className="post-menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="post-menu" role="menu">
                {isOwn ? (
                  <button className="post-menu-item is-danger" onClick={() => void removeVideo()}>
                    <Trash2 size={14} /> Xóa video
                  </button>
                ) : (
                  <>
                    {meId ? (
                      <button className="post-menu-item" onClick={() => void reportVideo()}>
                        <Flag size={14} /> Tố cáo bài viết
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button className="post-menu-item is-danger" onClick={() => void adminRemoveVideo()}>
                        <Trash2 size={14} /> ❌ Xóa bài viết (Admin)
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {v.caption ? <p className="post-copy">{v.caption}</p> : null}

      <div className="w-full max-w-md mx-auto">
        {direct ? (
          <button
            type="button"
            onClick={() => { setLightboxUrl(v.video_url); void trackView(); }}
            className="w-full overflow-hidden rounded-2xl cursor-pointer relative block"
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Mở video"
            style={{ padding: 0, border: 0, background: "transparent" }}
          >
            <video onContextMenu={(e) => e.preventDefault()}
              src={`${v.video_url}${v.video_url?.includes("#") ? "" : "#t=0.001"}`}
              muted
              playsInline
              preload="none"
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              className="block w-full h-auto"
              style={{ display: "block", width: "100%", height: "auto", maxHeight: "80vh", objectFit: "cover", background: "transparent" }}
            />

            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ background: "rgba(0,0,0,0.18)" }}
            >
              <span
                className="inline-flex items-center justify-center rounded-full backdrop-blur-md bg-white/20 border border-white/30 text-white"
                style={{
                  width: 56,
                  height: 56,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                <Play size={24} fill="currentColor" />
              </span>
            </span>
          </button>
        ) : (

          <button
            type="button"
            onClick={() => { setLightboxUrl(v.video_url); void trackView(); }}
            className="w-full overflow-hidden rounded-2xl cursor-pointer relative aspect-video max-h-[420px] md:max-h-[520px]"
            style={{ padding: 0, border: 0, background: "transparent" }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Mở video"
          >
            <iframe
              src={v.video_url}
              title="video"
              className="w-full h-full"
              style={{ border: 0, pointerEvents: "none", background: "transparent" }}
              allow="encrypted-media"
            />
          </button>

        )}
      </div>

      <VideoInteractions
        videoId={v.id}
        ownerId={v.user_id}
        meId={meId}
        createdAt={v.created_at}
        recipientName={authorName}
        onViewProfile={onViewProfile}
      />
      {lightboxUrl ? (
        <Portal>
          <div
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 z-[100010] flex items-center justify-center bg-black"
            style={{ opacity: 1, padding: 16 }}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative flex items-center justify-center"
              style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
                aria-label="Đóng"
                className="absolute p-3 text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60 active:scale-95 transition"
                style={{
                  top: `max(env(safe-area-inset-top, 0px), 12px)`,
                  right: `max(env(safe-area-inset-right, 0px), 12px)`,
                  zIndex: 10,
                  minWidth: 48,
                  minHeight: 48,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={26} />
              </button>
              <video
                src={lightboxUrl}
                controls
                autoPlay
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
                className="max-h-full max-w-full object-cover"
                style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, background: "#000", objectFit: "cover" }}
              />
            </div>
          </div>
        </Portal>
      ) : null}
    </article>
  );
}

export const VideoFeedCard = memo(VideoFeedCardImpl, (prev, next) => (
  prev.meId === next.meId &&
  prev.video.id === next.video.id &&
  prev.video.video_url === next.video.video_url &&
  prev.video.caption === next.video.caption &&
  prev.onRefresh === next.onRefresh &&
  prev.onViewProfile === next.onViewProfile
));
