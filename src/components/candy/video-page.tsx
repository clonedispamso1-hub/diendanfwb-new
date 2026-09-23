import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, X, MapPin, Play, Search } from "lucide-react";
import { Posts3DIcon } from "@/components/candy/posts-3d-icon";
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
import { resolveUserName } from "@/lib/user-name";
import { db2 } from "@/lib/db/router";
import { VIDEO_TABLE, deleteR2Object } from "@/lib/admin-videos";

interface VideoRow {
  id: string;
  user_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  /** id bản ghi metadata trong `video_posts` (Supabase #2), nếu có. */
  meta_id?: string | null;
  /** bảng gốc của video: "posts" (bài viết) hoặc "videos_social" (cũ). */
  source_table?: string;
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

const VIDEOS_SOCIAL_COLS = "id, user_id, video_url, caption, created_at";

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url) || url.startsWith("blob:");
}

interface VideoPageProps {
  onViewProfile?: (userId: string) => void;
  onBackToPosts?: () => void;
}

export function VideoPage({ onViewProfile, onBackToPosts }: VideoPageProps = {}) {
  const { me } = useAuth();
  const [items, setItems] = useState<VideoRow[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const activeQuery = useMemo(() => query.trim(), [query]);

  /** Nguồn chính: metadata video (Supabase #2) — URL file vẫn trỏ về Cloudflare R2. */
  const loadFromVideoPosts = async (searchTerm: string): Promise<VideoRow[] | null> => {
    let q: any = db2()
      .from(VIDEO_TABLE)
      .select("id, source_table, source_id, user_id, author_name, author_avatar, content, video_url, created_at")
      .order("created_at", { ascending: false });
    if (searchTerm) {
      const safe = searchTerm.replace(/[%_]/g, "\\$&");
      q = q.ilike("content", `%${safe}%`);
    } else {
      q = q.limit(50);
    }
    const { data, error } = await q;
    if (error) {
      if (!isMissingRelationError(error)) console.error("[videos] video_posts load error:", error);
      return null;
    }
    return ((data as any[]) || [])
      .filter((r) => typeof r.video_url === "string" && r.video_url)
      .map((r) => ({
        id: String(r.source_id || r.id),
        meta_id: r.id,
        source_table: r.source_table || "posts",
        user_id: r.user_id,
        video_url: r.video_url,
        caption: r.content ?? null,
        created_at: r.created_at,
      }));
  };

  /** Nguồn cũ (fallback): bảng `videos_social`. */
  const loadFromLegacy = async (searchTerm: string): Promise<VideoRow[]> => {
    let q: any = supabase
      .from("videos_social" as any)
      .select(VIDEOS_SOCIAL_COLS)
      .order("created_at", { ascending: false });
    if (searchTerm) {
      const safe = searchTerm.replace(/[%_]/g, "\\$&");
      q = q.ilike("caption", `%${safe}%`);
    } else {
      q = q.limit(50);
    }
    const { data, error } = await q;
    if (error) {
      if (!isMissingRelationError(error)) console.error("[videos] load error:", error);
      return [];
    }
    return ((data as any[]) || []).map((r) => ({
      ...r,
      source_table: "videos_social",
      meta_id: null,
    })) as VideoRow[];
  };

  const load = async (searchTerm = "") => {
    setLoading(true);
    const primary = await loadFromVideoPosts(searchTerm);
    const rows = primary && primary.length > 0 ? primary : await loadFromLegacy(searchTerm);
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    // Egress: 1 request gộp + cache 5 phút (profile-cache).
    const pmap = await fetchProfilesByIds(userIds, VIDEO_PROFILE_COLS);
    setItems(
      rows.map((r) => ({
        ...r,
        profiles: (pmap.get(r.user_id) as VideoRow["profiles"]) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void load(activeQuery);
    }, 320);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [activeQuery]);

  useEffect(() => {
    const ch = supabase
      .channel("videos-social")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos_social" },
        () => void load(activeQuery),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [activeQuery]);

  const removeVideo = async (row: VideoRow) => {
    if (!window.confirm("Bạn muốn xóa video này?")) return;
    const table = row.source_table === "videos_social" ? "videos_social" : "posts";
    const { error } = await supabase
      .from(table as any)
      .delete()
      .eq("id", row.id);
    if (error) return alert(error.message);
    // Xoá file gốc trên Cloudflare R2 (file video không bao giờ nằm ở Supabase Storage).
    if (row.video_url) await deleteR2Object(row.video_url);
    // Xoá luôn bản ghi metadata ở Supabase #2 (video_posts).
    if (row.meta_id) {
      await db2().from(VIDEO_TABLE).delete().eq("id", row.meta_id);
    }
    await load(activeQuery);
  };

  return (
    <section className="stack-lg">
      <div className="video-search-sticky">
        <div className="video-search-glow" />
        <div className="video-search-inner">
          <Search size={17} className="video-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm video..."
            className="video-search-input"
            aria-label="Tìm kiếm video"
          />
          {query ? (
            <button
              type="button"
              className="video-search-clear"
              aria-label="Xoá từ khoá"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <section className="stack-md">
        {items.length === 0 && !loading ? (
          <div className="empty-state">
            {activeQuery ? `Không tìm thấy video cho “${activeQuery}”.` : "Chưa có video nào."}
          </div>
        ) : null}

        {items.map((v) => {
          const isOwn = me?.id === v.user_id;
          const direct = isDirectVideoFile(v.video_url);
          const p = v.profiles;
          const authorName = resolveUserName(p as any, "Người dùng");
          const authorLocation = p?.province || p?.location || "";
          return (
            <article key={v.id} id={`video-${v.id}`} className="post-card">
              <div className="post-card-header">
                <button className="post-author" onClick={() => onViewProfile?.(v.user_id)}>
                  <span
                    className="post-avatar-wrap"
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <IntentBubble userId={v.user_id} initialIntent={p?.intent as any} size="sm" />
                    <img
                      loading="lazy"
                      decoding="async"
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
                    onClick={() => void removeVideo(v)}
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
                    <video
                      controlsList="nodownload"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      src={v.video_url}
                      muted
                      playsInline
                      preload="none"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxUrl(null);
                }}
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
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: 12,
                  background: "#000",
                }}
              />
            </div>
          </div>
        </Portal>
      ) : null}

      <motion.button
        type="button"
        className="posts-tab-switcher"
        aria-label="Bài viết"
        title="Bài viết"
        onClick={onBackToPosts}
        whileTap={{ scale: 0.9, rotate: 3 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
      >
        <Posts3DIcon />
      </motion.button>
    </section>
  );
}
