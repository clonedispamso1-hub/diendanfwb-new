import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useRef, useState } from "react";
import { X, Eye, ChevronLeft, ChevronRight, MoreHorizontal, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getMediaUrl as cdnUrl, getMediaThumb } from "@/lib/media";
import type { StoryRecord } from "@/components/candy/story-ring-avatar";

function timeAgoVi(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

interface Props {
  stories: StoryRecord[];
  isOwn: boolean;
  meId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  creatorName?: string | null;
  creatorAvatar?: string | null;
  onCreateNew?: () => void;
}

const DURATION_IMAGE = 5000;

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function computeFakeViews(storyId: string, createdAtIso: string): number {
  const seed = hashStr(storyId);
  const rand = mulberry32(seed);
  const periodMin = 60 + Math.floor(rand() * 31);
  const periodMs = periodMin * 60 * 1000;
  const offsetMs = Math.floor(rand() * periodMs);
  const start = new Date(createdAtIso).getTime();
  const ticks = Math.max(0, Math.floor((Date.now() - start + offsetMs) / periodMs));
  let total = 1 + Math.floor(rand() * 20);
  for (let i = 0; i < ticks; i++) {
    total += 1 + Math.floor(mulberry32(seed + i + 1)() * 60);
    if (total >= 999) { total = 999; break; }
  }
  return Math.min(999, Math.max(1, total));
}

export function StoryViewer({ stories, isOwn, meId, onClose, onChanged, creatorName, creatorAvatar, onCreateNew }: Props) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [viewCount, setViewCount] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creator, setCreator] = useState<{ name: string | null; avatar: string | null }>({
    name: creatorName ?? null,
    avatar: creatorAvatar ?? null,
  });
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);

  const cur = stories[idx];

  // Fetch creator info if not provided
  useEffect(() => {
    if (creator.name || creator.avatar || !cur?.user_id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles" as any)
        .select("full_name, avatar, username")
        .eq("id", cur.user_id)
        .maybeSingle();
      const p = data as any;
      if (p) setCreator({ name: p.full_name || p.username || "Người dùng", avatar: p.avatar || null });
    })();
  }, [cur?.user_id]);

  useEffect(() => {
    if (!cur) return;
    (async () => {
      if (meId && meId !== cur.user_id) {
        await supabase.from("story_views" as any).upsert(
          { story_id: cur.id, viewer_id: meId } as any,
          { onConflict: "story_id,viewer_id" } as any,
        );
      }
      const fake = computeFakeViews(cur.id, cur.created_at);
      if (isOwn) {
        const { count } = await supabase
          .from("story_views" as any)
          .select("viewer_id", { count: "exact", head: true })
          .eq("story_id", cur.id);
        setViewCount(Math.max(count ?? 0, fake));
      } else {
        setViewCount(fake);
      }
    })();
  }, [cur?.id, meId, isOwn]);

  useEffect(() => {
    if (!cur) return;
    if (cur.media_type === "video") {
      setProgress(0);
      return;
    }
    cancelAnimationFrame(rafRef.current ?? 0);
    startRef.current = performance.now();
    setProgress(0);
    const tick = (t: number) => {
      if (pausedRef.current) { startRef.current = t - progress * DURATION_IMAGE; }
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / DURATION_IMAGE);
      setProgress(p);
      if (p >= 1) advance(1);
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  const advance = (dir: 1 | -1) => {
    const n = idx + dir;
    if (n < 0) { setIdx(0); return; }
    if (n >= stories.length) { onClose(); return; }
    setIdx(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); advance(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); advance(1); }
      else if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, stories.length]);

  const handleDelete = async () => {
    if (!cur) return;
    setMenuOpen(false);
    if (!confirm("Xoá story này?")) return;
    await supabase.from("stories" as any).delete().eq("id", cur.id);
    onChanged?.();
    if (stories.length <= 1) { onClose(); return; }
    setIdx((i) => Math.max(0, i - 1));
  };

  const handleCopyLink = async () => {
    if (!cur) return;
    setMenuOpen(false);
    const url = `${window.location.origin}/?story=${cur.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black animate-in fade-in">
      {/* Safe-zone media container */}
      <div className="relative w-full h-full max-w-md mx-auto flex items-center justify-center overflow-hidden bg-black">
        {/* Media (bounded, object-contain) */}
        <div
          className="absolute inset-0 flex items-center justify-center select-none"
          onPointerDown={() => { pausedRef.current = true; }}
          onPointerUp={() => { pausedRef.current = false; }}
        >
          {cur.media_type === "video" ? (
            <video
              key={cur.id}
              src={cdnUrl(cur.media_url)}
              autoPlay
              playsInline
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onEnded={() => advance(1)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress(v.currentTime / v.duration);
              }}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <img loading="lazy" decoding="async"
              src={getMediaThumb(cur.media_url, 1080)}
              alt=""
              className="max-h-full max-w-full object-contain animate-in fade-in"
            />
          )}
        </div>

        {/* Top gradient overlay for legibility on white images */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-32 z-10"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}
        />
        {/* Bottom gradient */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 z-10"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
        />

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 px-3 pt-3 z-20">
          {/* Progress bars */}
          <div className="flex gap-1">
            {stories.map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white"
                  style={{
                    width: i < idx ? "100%" : i === idx ? `${Math.round(progress * 100)}%` : "0%",
                    transition: i === idx ? "none" : "width 200ms",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Creator row */}
          <div className="mt-3 flex items-center gap-2">
            <img loading="lazy" decoding="async"
              src={creator.avatar ? avatarSrc(creator.avatar, 36) : "/placeholder.svg"}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-sm font-semibold text-white truncate drop-shadow">
                {creator.name || "Người dùng"}
              </span>
              <span className="text-[11px] text-white/85 drop-shadow">
                {timeAgoVi(cur.created_at)}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
                aria-label="Tuỳ chọn"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
              >
                <MoreHorizontal size={18} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Đóng"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Prev/Next */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); advance(-1); }}
          aria-label="Story trước"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md border border-white/25 hover:bg-white/25 active:scale-95 transition disabled:opacity-30"
          disabled={idx === 0}
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); advance(1); }}
          aria-label="Story kế tiếp"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md border border-white/25 hover:bg-white/25 active:scale-95 transition"
        >
          <ChevronRight size={22} />
        </button>

        {/* Bottom-left: views */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!isOwn) toast.info("Chỉ chủ tin mới có thể xem danh sách người đã xem.");
          }}
          className="absolute bottom-5 left-4 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white shadow-lg cursor-default select-none"
          style={{
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.28)",
          }}
          aria-label="Lượt xem"
        >
          <Eye size={14} strokeWidth={2.2} />
          <span className="font-semibold tabular-nums">{viewCount.toLocaleString("vi-VN")}</span>
        </div>

      </div>

      {/* Action sheet menu */}
      {menuOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 animate-in fade-in"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-zinc-900 text-white border-t border-white/10 pb-6 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 mb-3 h-1 w-10 rounded-full bg-white/30" />
            {isOwn ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm text-red-400 hover:bg-white/5"
              >
                <Trash2 size={18} /> Xóa story
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm hover:bg-white/5"
            >
              <Link2 size={18} /> Sao chép liên kết
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center justify-center gap-3 px-5 py-3 mt-1 text-sm text-white/70 hover:bg-white/5"
            >
              Huỷ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
