import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useRef, useState } from "react";
import { Trash2, X, MapPin, Play, Film } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchProfilesByIds } from "@/lib/profile-cache";

const VIDEO_PROFILE_COLS =
  "id, full_name, username, avatar, vip_level, title_gif_url, gender, province, location, intent, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone";

import { useAuth } from "@/components/candy/auth-provider";
import { formatRelativeTime } from "@/lib/time-format";
import { VideoInteractions } from "@/components/candy/video-interactions";
import { VideoStatsOverlay } from "@/components/candy/video-stats-overlay";
import UniversalBadge from "@/components/candy/universal-badge";
import { GenderIcon } from "@/components/candy/gender-icon";
import { IntentBubble } from "@/components/candy/intent-bubble";
import { Portal } from "@/components/candy/portal";
import { isMissingRelationError } from "@/lib/db-compat";
import { uploadFile } from "@/lib/media";
import { toast } from "sonner";
import { resolveUserName } from "@/lib/user-name";

interface VideoRow {
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

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
const VIDEOS_SOCIAL_COLS = "id, user_id, video_url, caption, created_at";
const MAX_DURATION_SEC = 30;

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith("blob:");
}

async function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration || 0;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

interface VideoPageProps {
  onViewProfile?: (userId: string) => void;
}

export function VideoPage({ onViewProfile }: VideoPageProps = {}) {
  const { me } = useAuth();
  const [items, setItems] = useState<VideoRow[]>([]);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const SIZE_MSG = `Tài khoản của bạn hiện chỉ đăng được video dài tối đa ${MAX_DURATION_SEC} giây.`;
  const DURATION_MSG = `Tài khoản của bạn hiện chỉ đăng được video dài tối đa ${MAX_DURATION_SEC} giây.`;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const load = async () => {
    const { data: vids, error } = await supabase
      .from("videos_social" as any)
      .select(VIDEOS_SOCIAL_COLS)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (!isMissingRelationError(error)) console.error("[videos] load error:", error);
      setItems([]);
      return;
    }
    const rows = (vids || []) as any[];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    // Egress: 1 request gộp + cache 5 phút (profile-cache).
    const pmap = await fetchProfilesByIds(userIds, VIDEO_PROFILE_COLS);
    setItems(rows.map((r) => ({ ...r, profiles: pmap.get(r.user_id) || null })));
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("videos-social")
      .on("postgres_changes", { event: "*", schema: "public", table: "videos_social" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("video/")) {
      setUploadError("Vui lòng chọn tệp video.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(SIZE_MSG);
      return;
    }
    const dur = await probeDuration(file);
    if (dur && dur > MAX_DURATION_SEC) {
      setUploadError(DURATION_MSG);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearPicked = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(null);
    setPreviewUrl(null);
  };

  const submit = async () => {
    if (!me) return toast.error("Bạn cần đăng nhập.");
    if (!pickedFile) return toast.error("Vui lòng chọn video.");
    if (!caption.trim()) return toast.error("Vui lòng nhập nội dung.");
    setPosting(true);
    try {
      const url = await uploadFile(pickedFile, "post_videos");
      const { error } = await supabase
        .from("videos_social" as any)
        .insert([{ user_id: me.id, video_url: url, caption: caption.trim() }]);
      if (error) throw error;
      clearPicked();
      setCaption("");
      toast.success("Đã đăng video!");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Không đăng được video.");
    } finally {
      setPosting(false);
    }
  };

  const removeVideo = async (id: string) => {
    if (!window.confirm("Bạn muốn xóa video này?")) return;
    const { error } = await supabase.from("videos_social" as any).delete().eq("id", id);
    if (error) return alert(error.message);
    await load();
  };

  const canPost = !!pickedFile && !!caption.trim() && !posting;

  return (
    <section className="stack-lg">
      <section className="fb-composer">
        {previewUrl ? (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <video preload="none"
              src={previewUrl}
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="w-full rounded-xl border border-border bg-black"
              style={{ maxHeight: 280 }}
            />
            <button
              type="button"
              className="icon-button danger-button"
              onClick={clearPicked}
              title="Bỏ video"
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        {uploadError ? (
          <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: "0 0 6px", fontWeight: 500 }}>
            {uploadError}
          </p>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={onPickFile}
        />

        <div
          className="fb-composer-actions"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="icon-button"
            title={pickedFile ? "Đổi video" : "Chọn video"}
            aria-label="Chọn video"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent, var(--primary))))",
              color: "#fff",
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
            }}
          >
            <Film size={18} />
          </button>
          <textarea
            className="fb-composer-input"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Viết nội dung cho video (bắt buộc)..."
            rows={1}
            maxLength={500}
            style={{ flex: 1, minHeight: 40, resize: "none" }}
          />
          <button
            className="primary-cta compact"
            onClick={() => void submit()}
            disabled={!canPost}
          >
            {posting ? "..." : "Đăng"}
          </button>
        </div>
      </section>

      <section className="stack-md">
        {items.length === 0 ? <div className="empty-state">Chưa có video nào. Hãy là người đầu tiên đăng!</div> : null}

        {items.map((v) => {
          const isOwn = me?.id === v.user_id;
          const direct = isDirectVideoFile(v.video_url);
          const p = v.profiles;
          const authorName = resolveUserName(p as any, "Người dùng");
          const authorLocation = p?.province || p?.location || "";
          return (
            <article key={v.id} id={`video-${v.id}`} className="post-card">
              <div className="post-card-header">
                <button
                  className="post-author"
                  onClick={() => onViewProfile?.(v.user_id)}
                >
                  <span className="post-avatar-wrap" style={{ position: "relative", display: "inline-block" }}>
                    <IntentBubble userId={v.user_id} initialIntent={p?.intent as any} size="sm" />
                    <img loading="lazy" decoding="async"
                      className="avatar-md post-avatar"
                      src={avatarSrc(p?.avatar || "/placeholder.svg", 64)}
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
                  </div>
                </button>
                {isOwn ? (
                  <button
                    className="icon-button danger-button"
                    onClick={() => void removeVideo(v.id)}
                    title="Xóa video"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>

              {v.caption ? <p className="post-copy">{v.caption}</p> : null}

              <div>
                {direct ? (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(v.video_url)}
                    className="video-square-thumb"
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "1 / 1",
                      overflow: "hidden",
                      borderRadius: 14,
                      border: "1px solid hsl(var(--border))",
                      background: "#000",
                      padding: 0,
                      cursor: "pointer",
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Mở video"
                  >
                    <video controlsList="nodownload" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
                      src={v.video_url}
                      muted
                      playsInline
                      preload="none"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <span
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.92)",
                          color: "#111",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                        }}
                      >
                        <Play size={26} fill="currentColor" />
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(v.video_url)}
                    className="w-full overflow-hidden bg-black"
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 14,
                      border: "1px solid hsl(var(--border))",
                      padding: 0,
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Mở video"
                  >
                    <iframe
                      src={v.video_url}
                      title="video"
                      style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }}
                      allow="encrypted-media"
                    />
                  </button>
                )}
              </div>

              <VideoStatsOverlay videoId={v.id} createdAt={v.created_at} />

              <div className="post-timestamp">{formatRelativeTime(v.created_at)}</div>

              <VideoInteractions
                videoId={v.id}
                ownerId={v.user_id}
                meId={me?.id}
                createdAt={v.created_at}
                recipientName={authorName}
                onViewProfile={onViewProfile}
              />
            </article>
          );
        })}
      </section>

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
                style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, background: "#000" }}
              />
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
