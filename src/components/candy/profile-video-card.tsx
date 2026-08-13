import { avatarSrc } from "@/lib/image-cdn";
import { useState } from "react";
import { Trash2, MoreHorizontal, Flag } from "lucide-react";
import { toast } from "sonner";
import { submitReport } from "@/services/reports-v2.service";
import { supabase } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/time-format";
import { VideoInteractions } from "@/components/candy/video-interactions";
import { useAuth } from "@/components/candy/auth-provider";

interface VideoRow {
  id: string;
  user_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  profiles?: { full_name: string | null; username: string | null; avatar: string | null; avatar_url: string | null } | null;
}

interface Props {
  meId?: string;
  video: VideoRow;
  onRefresh: () => void;
  onViewProfile: (userId: string) => void;
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith("blob:");
}

export function ProfileVideoCard({ meId, video, onRefresh, onViewProfile }: Props) {
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwn = meId === video.user_id;
  const direct = isDirectVideoFile(video.video_url);

  const removeVideo = async () => {
    setMenuOpen(false);
    if (!window.confirm("Xóa video này?")) return;
    const { error } = await supabase.from("videos_social" as any).delete().eq("id", video.id);
    if (error) return alert(error.message);
    onRefresh();
  };

  const adminRemoveVideo = async () => {
    setMenuOpen(false);
    if (!window.confirm("Bạn chắc chắn muốn xóa bài viết này với tư cách Admin chứ?")) return;
    const { error } = await supabase.from("videos_social" as any).delete().eq("id", video.id);
    if (error) {
      toast.error(error.message || "Không thể xóa video.");
      return;
    }
    toast.success("Đã gỡ bỏ bài đăng thành công!");
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
        reportedUserId: video.user_id,
        targetId: video.id,
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
    <article id={`video-${video.id}`} className="post-card">
      <div className="inline-flex items-start justify-between gap-3 w-full">
        <button
          className="post-author"
          onClick={() => onViewProfile(video.user_id)}
          style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        >
          <img loading="lazy" decoding="async"
            className="avatar-md"
            src={avatarSrc(video.profiles?.avatar || video.profiles?.avatar_url || "/placeholder.svg", 64)}
            alt=""
          />
          <div className="stack-xs text-left">
            <span className="row-title">{video.profiles?.full_name || "Người dùng"}</span>
            <span className="row-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatRelativeTime(video.created_at)} · 🎬 Video
            </span>
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

      {video.caption ? <p className="post-copy">{video.caption}</p> : null}

      {direct ? (
        <video
          src={`${video.video_url}${video.video_url?.includes("#") ? "" : "#t=0.001"}`}
          controls
          preload="none"
          playsInline
          controlsList="nodownload noremoteplayback noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="w-full rounded-xl border border-border bg-black"
        />
      ) : (
        <div className="w-full rounded-xl border border-border overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={video.video_url}
            title="video"
            className="w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <VideoInteractions
        videoId={video.id}
        ownerId={video.user_id}
        meId={meId}
        createdAt={video.created_at}
        recipientName={video.profiles?.full_name || "Tác giả video"}
        onViewProfile={onViewProfile}
      />
    </article>
  );
}
