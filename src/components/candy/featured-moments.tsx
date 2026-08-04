import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/media";
import { ImageLightbox } from "@/components/candy/image-lightbox";

const CAPTION_MAX = 60;
const MAX_VIDEO_SECONDS = 15;

export interface FeaturedMoment {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  position: number;
  created_at: string;
  media_type?: "image" | "video" | null;
  duration_seconds?: number | null;
}

type LightboxState = { src: string; type: "image" | "video" } | null;

interface Props {
  userId: string;
  isOwn: boolean;
  onCountChange?: (count: number) => void;
}

const MAX_ITEMS = 5;

async function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được video")); };
  });
}

const CAPTION_INLINE_MAX = 9;

function CaptionEditor({
  momentId,
  initial,
  onSaved,
}: {
  momentId: string;
  initial: string | null;
  onSaved: (val: string) => void;
}) {
  const [value, setValue] = useState<string>(() =>
    Array.from(initial ?? "").slice(0, CAPTION_INLINE_MAX).join(""),
  );
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const remaining = CAPTION_INLINE_MAX - Array.from(value).length;

  const commit = async () => {
    const next = Array.from(value).slice(0, CAPTION_INLINE_MAX).join("").trim();
    const original = (initial ?? "").trim();
    if (next === original) return;
    setSaving(true);
    const { error } = await supabase
      .from("featured_moments" as any)
      .update({ caption: next || null } as any)
      .eq("id", momentId);
    setSaving(false);
    if (error) {
      toast.error("Không lưu được chú thích");
      return;
    }
    onSaved(next);
  };

  return (
    <div className="featured-moment-caption-below flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        maxLength={CAPTION_INLINE_MAX}
        placeholder="Nhập chú thích"
        onChange={(e) => {
          const v = Array.from(e.target.value).slice(0, CAPTION_INLINE_MAX).join("");
          setValue(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); void commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        disabled={saving}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs placeholder:opacity-50 focus:placeholder:opacity-30"
      />
      {(focused || value.length > 0) && (
        <span
          className={`shrink-0 text-[10px] tabular-nums font-medium ${
            remaining === 0 ? "text-rose-400" : "text-muted-foreground opacity-70"
          }`}
          aria-label="Số ký tự còn lại"
        >
          {remaining}
        </span>
      )}
    </div>
  );
}

export function FeaturedMoments({ userId, isOwn, onCountChange }: Props) {

  const [items, setItems] = useState<FeaturedMoment[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const loadViewCounts = async (ids: string[]) => {
    if (!ids.length) { setViewCounts({}); return; }
    const counts: Record<string, number> = {};
    await Promise.all(ids.map(async (id) => {
      const { count } = await supabase
        .from("featured_moment_views" as any)
        .select("viewer_id", { count: "exact", head: true })
        .eq("moment_id", id);
      counts[id] = count ?? 0;
    }));
    setViewCounts(counts);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("featured_moments" as any)
      .select("*")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .limit(MAX_ITEMS);
    if (!error && data) {
      setItems(data as any);
      void loadViewCounts((data as any[]).map((d) => d.id));
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [userId]);
  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = el.querySelectorAll<HTMLElement>(".featured-moment-card");
      if (!cards.length) return;
      const left = el.scrollLeft;
      let best = 0, bestDist = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft - left);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      setActiveIdx(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // Upload entry point removed from header per design; file input still wired for future use.

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (items.length >= MAX_ITEMS) { toast.warning("⚠️ Bạn chỉ được phép đăng tối đa 5 tin nổi bật thôi!"); return; }

    const isVideo = (file.type || "").startsWith("video/");
    let duration: number | null = null;
    if (isVideo) {
      try {
        duration = await probeVideoDuration(file);
      } catch {
        return alert("Không đọc được video.");
      }
      if (duration > MAX_VIDEO_SECONDS + 0.5) {
        return alert(`Video phải dưới ${MAX_VIDEO_SECONDS} giây.`);
      }
    }

    const rawCaption = window.prompt(`Chú thích (tối đa ${CAPTION_MAX} ký tự, có thể bỏ trống):`, "") || "";
    const caption = Array.from(rawCaption.trim()).slice(0, CAPTION_MAX).join("");

    setUploading(true);
    try {
      const url = await uploadFile(file, "featured-moments");
      const nextPos = items.length;
      const { error } = await supabase.from("featured_moments" as any).insert({
        user_id: userId,
        image_url: url,
        caption: caption || null,
        position: nextPos,
        media_type: isVideo ? "video" : "image",
        duration_seconds: duration,
      } as any);
      if (error) throw error;
      await load();
    } catch (err: any) {
      alert(err?.message || "Tải lên thất bại");
    } finally {
      setUploading(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!window.confirm("Xoá tin này?")) return;
    const { error } = await supabase.from("featured_moments" as any).delete().eq("id", id);
    if (error) return alert(error.message);
    await load();
  };

  if (loading) return null;
  if (!isOwn && items.length === 0) return null;

  return (
    <section className="featured-moments" aria-label="Tin nổi bật">
      <div className="featured-moments-header">
        <span className="featured-moments-title">
          <Sparkles size={14} className="text-indigo-400" />
          Tin nổi bật
        </span>
        {isOwn && items.length < MAX_ITEMS ? (
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onUpload} />
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="featured-moment-empty">
          Chưa có tin nổi bật. Thêm ảnh hoặc video ngắn (≤ {MAX_VIDEO_SECONDS}s).
        </div>
      ) : (
        <div className="featured-moments-scroller">
          {items.length > 3 ? (
            <>
              <button type="button" className="featured-moments-nav prev" onClick={() => scrollBy(-1)} aria-label="Trước">
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="featured-moments-nav next" onClick={() => scrollBy(1)} aria-label="Sau">
                <ChevronRight size={16} />
              </button>
            </>
          ) : null}

          <div className="featured-moments-track" ref={trackRef}>
            {items.map((m) => {
              const isVideo = m.media_type === "video";
              return (
                <div key={m.id} className="featured-moment-card">
                  {isOwn ? (
                    <button
                      type="button"
                      className="featured-moment-delete"
                      onClick={(e) => { e.stopPropagation(); void removeItem(m.id); }}
                      aria-label="Xoá"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                  <div
                    className="featured-moment-media relative"
                    onClick={async () => {
                      // Track view (chặn self-view)
                      if (meId && meId !== m.user_id) {
                        try {
                          await supabase.from("featured_moment_views" as any).upsert(
                            { moment_id: m.id, viewer_id: meId } as any,
                            { onConflict: "moment_id,viewer_id" } as any,
                          );
                          setViewCounts((prev) => ({ ...prev, [m.id]: (prev[m.id] ?? 0) + (prev[m.id] !== undefined ? 0 : 1) }));
                          void loadViewCounts(items.map((it) => it.id));
                        } catch { /* best-effort */ }
                      }
                      setLightbox({ src: m.image_url, type: isVideo ? "video" : "image" });
                    }}
                    role="button"
                  >
                    {isVideo ? (
                      <>
                        <video
                          className="featured-moment-img"
                          src={`${m.image_url}${m.image_url?.includes("#") ? "" : "#t=0.001"}`}
                          muted
                          playsInline
                          loop
                          preload="none"
                          controlsList="nodownload noremoteplayback noplaybackrate"
                          disablePictureInPicture
                          onContextMenu={(e) => e.preventDefault()}
                          onMouseEnter={(e) => { try { (e.currentTarget as HTMLVideoElement).play(); } catch {} }}
                          onMouseLeave={(e) => { try { (e.currentTarget as HTMLVideoElement).pause(); } catch {} }}
                        />
                        <span className="featured-moment-badge"><Play size={10} /> Video</span>
                      </>
                    ) : (
                      <img
                        className="featured-moment-img"
                        src={m.image_url}
                        alt={m.caption || "Tin nổi bật"}
                        loading="lazy"
                        draggable={false}
                      />
                    )}
                  </div>
                  {isOwn ? (
                    <CaptionEditor
                      momentId={m.id}
                      initial={m.caption}
                      onSaved={(val) =>
                        setItems((prev) => prev.map((it) => (it.id === m.id ? { ...it, caption: val } : it)))
                      }
                    />
                  ) : (
                    <div className="featured-moment-caption-below" title={m.caption || ""}>
                      {m.caption || ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {items.length > 1 ? (
            <div className="featured-moments-dots" role="tablist">
              {items.map((_, i) => (
                <span key={i} className={`featured-moments-dot ${i === activeIdx ? "is-active" : ""}`} />
              ))}
            </div>
          ) : null}
        </div>
      )}
      {lightbox ? <ImageLightbox src={lightbox.src} mediaType={lightbox.type} alt="Featured" onClose={() => setLightbox(null)} /> : null}
    </section>
  );
}
