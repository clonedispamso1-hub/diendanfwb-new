import { avatarSrc } from "@/lib/image-cdn";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  Play,
  X,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Link2,
  Trash2,
  Flag,
} from "lucide-react";
import { toast } from "sonner";

import { getMediaUrl as cdnUrl, getMediaThumb } from "@/lib/media";

// Kích thước tải thực tế trên feed — tránh kéo ảnh gốc (giảm Egress rất mạnh).
const FEED_SINGLE_W = 320;
const FEED_CELL_W = 320;
const FEED_SLIDE_W = 320;
import { videoThumbSrc } from "@/lib/utils";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export interface LightboxOverlay {
  authorName: string;
  authorAvatar?: string | null;
  liked?: boolean;
  likes?: number;
  comments?: number;
  gifts?: number;
  views?: number;
  onToggleLike?: () => void;
  onOpenComments?: () => void;
  onOpenGift?: () => void;
  onSubmitComment?: (text: string) => void | Promise<void>;
  /** Post identity — used for menu actions (copy link / uid / delete / report) */
  postId?: string;
  ownerId?: string;
  meId?: string | null;
  /** Called when the author taps "Xóa bài viết" inside the viewer menu. */
  onDeletePost?: () => void | Promise<void>;
  /** Called when a non-author taps "Tố cáo bài viết" inside the viewer menu. */
  onReportPost?: () => void;
}

interface PostMediaProps {
  urls: string[];
  alt?: string;
  compact?: boolean;
  overlay?: LightboxOverlay;
}

type MediaItem = { url: string; kind: "image" | "video" };

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|ogv)(\?|#|$)/i;
const REMOTE_VIDEO_RE = /\/video\/upload\//i;

function isVideoUrl(u: string): boolean {
  if (!u) return false;
  return REMOTE_VIDEO_RE.test(u) || VIDEO_EXT_RE.test(u);
}

function classify(urls: string[]): MediaItem[] {
  return (urls || [])
    .filter((u) => typeof u === "string" && /^(https?:|data:|blob:)/.test(u.trim()))
    .map((u) => ({ url: u, kind: isVideoUrl(u) ? "video" : "image" } as MediaItem));
}

/* Threads-style tokens */
const RADIUS = 20;
const FRAME_SHADOW =
  "0 1px 0 hsl(var(--border) / 0.4) inset, 0 6px 20px -14px rgba(0,0,0,0.35)";
const FRAME_BG = "#0a0a0a";

/**
 * Media block — square 1:1, full width of the card.
 *  - 1 ảnh / 1 video: full width, aspect-ratio 1/1, radius 20.
 *  - 2-4 ảnh: grid; mỗi ô vuông 1:1.
 *  - >=2 (mixed/video): carousel, mỗi slide vuông 1:1.
 */
export const PostMedia = memo(function PostMedia({ urls, alt = "Media bài viết", compact, overlay }: PostMediaProps) {
  const items = useMemo(() => classify(urls), [urls]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const openLightbox = useCallback((i: number) => setLightbox(i), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  if (items.length === 0) return null;

  const radius = compact ? 16 : RADIUS;

  // Task #3:
  //  - 1 media (image/video) → full width, dynamic aspect ratio for images.
  //  - 2+ media (any mix) → horizontal snap carousel, tap to open fullscreen.
  //  Never stack multiple images vertically (grid layout removed on purpose).
  const allImages = items.every((it) => it.kind === "image");

  const body = items.length === 1 ? (
    items[0].kind === "video" ? (
      <div className="pm-card">
        <SingleVideo src={items[0].url} onExpand={() => setLightbox(0)} />
      </div>
    ) : (
      <div className="tm-wrap">
        <SingleImage src={getMediaThumb(items[0].url, FEED_SINGLE_W)} alt={alt} onExpand={() => setLightbox(0)} />
      </div>
    )
  ) : allImages ? (
    <div className="tm-wrap">
      <ImageMosaic items={items} alt={alt} onExpand={openLightbox} />
    </div>
  ) : (
    <div className="pm-card pm-card--carousel">
      <MediaCarousel items={items} alt={alt} onExpand={openLightbox} radius={radius} />
    </div>

  );


  return (
    <>
      {body}
      {lightbox !== null ? (
        <MediaLightbox
          items={items}
          startIndex={lightbox}
          alt={alt}
          onClose={closeLightbox}
          overlay={overlay}
        />
      ) : null}
    </>
  );
});


/* ===================== Threads-style Image Mosaic (2+) ===================== */

function MosaicCell({
  item,
  index,
  alt,
  onExpand,
  more,
}: {
  item: MediaItem;
  index: number;
  alt: string;
  onExpand: (i: number) => void;
  more?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      className="tm-cell"
      aria-label={`Xem ảnh ${index + 1}`}
      onClick={() => onExpand(index)}
    >
      <img
        src={getMediaThumb(item.url, FEED_CELL_W)}
        alt={`${alt} ${index + 1}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-loaded={loaded ? "true" : "false"}
        onLoad={() => setLoaded(true)}
      />
      {more ? <span className="tm-more">+{more}</span> : null}
    </button>
  );
}

function ImageMosaic({
  items,
  alt,
  onExpand,
}: {
  items: MediaItem[];
  alt: string;
  onExpand: (i: number) => void;
}) {
  const total = items.length;
  const visibleCount = total === 2 ? 2 : total === 3 ? 3 : 4;
  const visible = items.slice(0, visibleCount);
  const extra = total - visibleCount;
  return (
    <div className={`tm-grid tm-grid--${visibleCount}`} data-count={total} style={{ position: "relative" }}>
      {visible.map((it, i) => (
        <MosaicCell
          key={it.url + i}
          item={it}
          index={i}
          alt={alt}
          onExpand={onExpand}
          more={i === visibleCount - 1 && extra > 0 ? extra : 0}
        />
      ))}
      <span className="tm-pill">📷 {total}</span>
    </div>
  );
}

/* ============================== Single Image ============================== */

function MediaBadge({ label }: { label: string }) {
  return (
    <span className="pm-badge" aria-hidden>
      {label}
    </span>
  );
}

function SingleImage({ src, alt, onExpand }: { src: string; alt: string; onExpand: () => void }) {
  // Threads-style: khung bo góc, giới hạn chiều cao, cover, căn giữa, không méo.
  const [ratio, setRatio] = useState<number | null>(null);
  const isGif = /\.gif(\?|#|$)/i.test(src);
  // Giới hạn tỉ lệ để ảnh quá dài/quá cao không chiếm hết màn hình.
  const clamped = ratio ? Math.min(Math.max(ratio, 0.75), 1.91) : null;
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={isGif ? "Xem GIF" : "Xem ảnh"}
      className="tm-single"
      style={{ aspectRatio: `${clamped ?? 4 / 5}` }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
      />
      {isGif ? <span className="tm-pill">GIF</span> : null}
    </button>
  );
}


/* ============================== Single Video ============================== */

function SingleVideo({ src, onExpand }: { src: string; onExpand?: () => void }) {
  // Thumbnail-first: chỉ mount player thật khi người dùng bấm Play.
  // Aspect ratio đọc từ metadata → fix lỗi Safari iOS / Chrome Android
  // hiển thị video thành một đường ngang.
  const [ratio, setRatio] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Probe metadata bằng một element rời (không render), lấy đúng tỉ lệ.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    (probe as any).playsInline = true;
    probe.crossOrigin = "anonymous";
    const done = () => {
      if (cancelled) return;
      const w = probe.videoWidth;
      const h = probe.videoHeight;
      setRatio(w && h ? Math.max(0.5, w / h) : 16 / 9);
    };
    probe.onloadedmetadata = done;
    probe.onerror = () => { if (!cancelled) setRatio(16 / 9); };
    probe.src = videoThumbSrc(src);
    const t = window.setTimeout(() => { if (!cancelled && !probe.videoWidth) setRatio(16 / 9); }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      probe.removeAttribute("src");
      try { probe.load(); } catch { /* noop */ }
    };
  }, [src]);

  if (ratio == null) {
    return <div className="pm-skeleton" aria-label="Đang tải video" />;
  }

  return (
    <div className="pm-video" data-playing={playing ? "true" : "false"} style={{ aspectRatio: `${ratio}` }}>
      {playing ? (
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          preload="metadata"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <>
          <video
            src={videoThumbSrc(src)}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            className="pm-video__poster"
            onContextMenu={(e) => e.preventDefault()}
          />
          <button
            type="button"
            className="pm-play"
            aria-label="Phát video"
            onClick={() => setPlaying(true)}
          >
            <span className="pm-play__circle">
              <Play size={26} fill="currentColor" />
            </span>
          </button>
          <MediaBadge label="▶ Video" />
        </>
      )}
      {onExpand ? null : null}
    </div>
  );
}


/* ============================== Carousel (2+) ============================== */

/**
 * Một slide — memo hoá để khi đổi ảnh (selected thay đổi) React KHÔNG
 * render lại toàn bộ slide/ảnh, chỉ slide có prop đổi mới re-render.
 */
const CarouselSlide = memo(function CarouselSlide({
  item,
  index,
  alt,
  radius,
  shouldLoad,
  isActive,
  onExpand,
  setVideoRef,
  onPointerDownSlide,
  onPointerUpSlide,
  onPointerCancelSlide,
}: {
  item: MediaItem;
  index: number;
  alt: string;
  radius: number;
  shouldLoad: boolean;
  isActive: boolean;
  onExpand: (i: number) => void;
  setVideoRef: (i: number, el: HTMLVideoElement | null) => void;
  onPointerDownSlide: (e: React.PointerEvent) => void;
  onPointerUpSlide: (e: React.PointerEvent, i: number) => void;
  onPointerCancelSlide: () => void;
}) {
  return (
    <div
      className="wm-frame"
      onPointerDown={onPointerDownSlide}
      onPointerUp={(e) => onPointerUpSlide(e, index)}
      onPointerCancel={onPointerCancelSlide}
      style={{
        flex: "0 0 100%",
        minWidth: 0,
        width: "100%",
        aspectRatio: "4 / 5",
        borderRadius: radius,
        overflow: "hidden",
        background: "transparent",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: FRAME_SHADOW,
        position: "relative",
        cursor: "zoom-in",
        // GPU acceleration — mỗi slide là một layer riêng, không repaint chéo.
        transform: "translate3d(0,0,0)",
        backfaceVisibility: "hidden",
        contain: "content",
      }}
    >
      {item.kind === "video" ? (
        <CarouselVideo
          src={item.url}
          isActive={isActive}
          setRef={(el) => setVideoRef(index, el)}
          onExpand={() => onExpand(index)}
        />
      ) : shouldLoad ? (
        <img
          src={getMediaThumb(item.url, FEED_SLIDE_W)}
          alt={`${alt} ${index + 1}`}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
            background: "transparent",
            transform: "translate3d(0,0,0)",
            backfaceVisibility: "hidden",
          }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "transparent" }} aria-hidden="true" />
      )}
    </div>
  );
});

const MediaCarousel = memo(function MediaCarousel({
  items,
  alt,
  onExpand,
  radius = RADIUS,
}: {
  items: MediaItem[];
  alt: string;
  onExpand: (i: number) => void;
  radius?: number;
}) {
  const [emblaRef, embla] = useEmblaCarousel({
    align: "start",
    loop: false,
    dragFree: false,
    containScroll: "trimSnaps",
    watchDrag: true,
    dragThreshold: 6,
    duration: 18,
    skipSnaps: false,
    inViewThreshold: 0.4,
  });
  const [selected, setSelected] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const setVideoRef = useCallback((i: number, el: HTMLVideoElement | null) => {
    videoRefs.current[i] = el;
  }, []);

  // Lazy window: chỉ giữ ảnh hiện tại + trước + sau (đã tải thì không bỏ).
  const [loadWindow, setLoadWindow] = useState<Set<number>>(() => new Set([0, 1]));


  const onSelect = useCallback(() => {
    if (!embla) return;
    setSelected(embla.selectedScrollSnap());
    setInteracted(true);
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla, onSelect]);

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === selected) v.play().catch(() => {});
      else v.pause();
    });
  }, [selected]);

  // Auto-fade the swipe hint after 4s (or on first interaction)
  useEffect(() => {
    const t = window.setTimeout(() => setShowHint(false), 4000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (interacted) setShowHint(false);
  }, [interacted]);

  const goPrev = useCallback(() => embla?.scrollPrev(), [embla]);
  const goNext = useCallback(() => embla?.scrollNext(), [embla]);

  // Preload ảnh trước / sau + mở rộng cửa sổ lazy-load.
  useEffect(() => {
    setLoadWindow((prev) => {
      const next = new Set(prev);
      [selected - 1, selected, selected + 1].forEach((i) => {
        if (i >= 0 && i < items.length) next.add(i);
      });
      return next.size === prev.size ? prev : next;
    });
    if (typeof window === "undefined") return;
    [selected - 1, selected + 1].forEach((i) => {
      const it = items[i];
      if (!it || it.kind !== "image") return;
      const img = new Image();
      img.decoding = "async";
      img.src = getMediaThumb(it.url, FEED_SLIDE_W);
    });
  }, [selected, items]);

  // Reliable tap vs drag detection: track pointer delta on the frame.
  // Embla can swallow the child <img loading="lazy" decoding="async"> click on touch; handle it on the frame.
  const pointerRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  }, []);
  const handlePointerCancel = useCallback(() => {
    pointerRef.current = null;
  }, []);
  const handlePointerUp = useCallback(
    (e: React.PointerEvent, i: number) => {
      const start = pointerRef.current;
      pointerRef.current = null;
      if (!start || start.id !== e.pointerId) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      const dt = Date.now() - start.t;
      if (dx < 8 && dy < 8 && dt < 500) {
        setInteracted(true);
        onExpand(i);
      }
    },
    [onExpand],
  );


  const hasPrev = selected > 0;
  const hasNext = selected < items.length - 1;

  // Gesture isolation (native-level): once the finger's motion is clearly
  // horizontal, stop the touch event from bubbling to ANY ancestor listener
  // (tab swipe, page pull-to-refresh, etc.) so Embla owns the gesture fully.
  // We use native listeners because React's synthetic stopPropagation does
  // not affect native ancestor listeners.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let sx = 0;
    let sy = 0;
    let claimed = false;
    const onStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      sx = ev.touches[0].clientX;
      sy = ev.touches[0].clientY;
      claimed = false;
    };
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const dx = ev.touches[0].clientX - sx;
      const dy = ev.touches[0].clientY - sy;
      if (!claimed && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        claimed = true;
      }
      if (claimed) {
        // Prevent ancestor tab/page swipe handlers from also acting on this
        // horizontal gesture. Do NOT preventDefault — that would kill Embla.
        ev.stopPropagation();
      }
    };
    const onEnd = () => {
      claimed = false;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", touchAction: "pan-y" }}
      data-no-tab-swipe="true"
    >
      <div
        ref={emblaRef}
        className="embla embla__viewport"
        data-embla-container="true"
        data-no-tab-swipe="true"
        style={{ overflow: "hidden", borderRadius: radius, touchAction: "pan-y" }}
      >

        <div
          style={{
            display: "flex",
            willChange: "transform",
            transform: "translate3d(0,0,0)",
            backfaceVisibility: "hidden",
          }}
        >
          {items.map((it, i) => (
            <CarouselSlide
              key={it.url + i}
              item={it}
              index={i}
              alt={alt}
              radius={radius}
              shouldLoad={loadWindow.has(i)}
              isActive={selected === i}
              onExpand={onExpand}
              setVideoRef={setVideoRef}
              onPointerDownSlide={handlePointerDown}
              onPointerUpSlide={handlePointerUp}
              onPointerCancelSlide={handlePointerCancel}
            />
          ))}
        </div>

      </div>

      {/* Media badge — số lượng ảnh + vị trí hiện tại */}
      <span className="tm-pill" aria-hidden="true">
        📷 {selected + 1} / {items.length}
      </span>


      {hasPrev ? (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Ảnh trước"
          className="wm-nav-arrow wm-nav-arrow--prev"
          style={arrowStyle("left")}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      ) : null}
      {hasNext ? (
        <button
          type="button"
          onClick={goNext}
          aria-label="Ảnh sau"
          className="wm-nav-arrow wm-nav-arrow--next"
          style={arrowStyle("right")}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      ) : null}

      {showHint && items.length > 1 ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            /* backdrop-filter bỏ đi: gây drop-frame khi vuốt trên Android */

            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            animation: "wmHintPulse 1.6s ease-in-out infinite",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span>Vuốt để xem thêm ảnh</span>
          <ChevronRight size={16} aria-hidden="true" />
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Trang media"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          marginTop: 12,
        }}
      >
        {items.map((_, i) => (
          <button
            type="button"
            key={i}
            role="tab"
            aria-selected={i === selected}
            aria-label={`Ảnh ${i + 1}`}
            onClick={() => embla?.scrollTo(i)}
            style={{
              width: i === selected ? 22 : 8,
              height: 8,
              borderRadius: 999,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background:
                i === selected ? "hsl(var(--foreground) / 0.9)" : "hsl(var(--foreground) / 0.25)",
              transition: "width 180ms ease, background 180ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
});

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  const s: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translate3d(0,-50%,0)",
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "none",
    background: "rgba(0,0,0,0.62)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    /* backdrop-filter bỏ đi để giữ FPS khi vuốt trên Android tầm trung */
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 3,

  };
  if (side === "left") s.left = 10;
  else s.right = 10;
  return s;
}


function CarouselVideo({
  src,
  isActive,
  setRef,
  onExpand,
}: {
  src: string;
  isActive: boolean;
  setRef: (el: HTMLVideoElement | null) => void;
  onExpand: () => void;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

  const stopPreview = useCallback(() => {
    heldRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = localRef.current;
    if (v) {
      v.pause();
      try { v.currentTime = 0; } catch {}
    }
  }, []);

  const startPreview = useCallback(() => {
    const v = localRef.current;
    if (!v) return;
    heldRef.current = true;
    v.muted = true;
    try { v.currentTime = 0; } catch {}
    v.play().catch(() => {});
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => stopPreview(), 3000);
  }, [stopPreview]);

  useEffect(() => {
    if (!isActive) stopPreview();
  }, [isActive, stopPreview]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onPointerDown={(e) => { if (e.button === 0 || e.pointerType !== "mouse") startPreview(); }}
      onPointerUp={stopPreview}
      onPointerLeave={stopPreview}
      onPointerCancel={stopPreview}
    >
      <video controlsList="nodownload" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
        ref={(el) => {
          localRef.current = el;
          setRef(el);
        }}
        src={isActive ? videoThumbSrc(src) : undefined}
        data-src={src}
        playsInline
        muted
        loop
        preload={isActive ? "auto" : "none"}
        onClick={onExpand}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: FRAME_BG,
          cursor: "zoom-in",
          display: "block",
        }}
      />
    </div>
  );
}

/* ============================== Lightbox ============================== */

function formatLbCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function MediaLightbox({
  items,
  startIndex,
  alt,
  onClose,
  overlay,
}: {
  items: MediaItem[];
  startIndex: number;
  alt: string;
  onClose: () => void;
  overlay?: LightboxOverlay;
}) {
  const [i, setI] = useState(startIndex);
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const goPrev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  const goNext = useCallback(() => setI((v) => Math.min(items.length - 1, v + 1)), [items.length]);

  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // ESC first closes the menu (if open), then the viewer.
        if (menuOpen) { setMenuOpen(false); return; }
        onClose();
      }
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("media-viewer-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("media-viewer-open");
    };
  }, [goPrev, goNext, onClose, menuOpen]);

  const cur = items[i];
  const multi = items.length > 1;
  const isOwner = !!(overlay?.meId && overlay?.ownerId && overlay.meId === overlay.ownerId);
  const postUrl =
    overlay?.postId && typeof window !== "undefined"
      ? `${window.location.origin}/post/${overlay.postId}`
      : "";

  const mediaUrl = cur ? (cur.kind === "image" ? cdnUrl(cur.url) : cur.url) : "";

  const closeMenu = () => setMenuOpen(false);

  const copy = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const downloadCurrent = async () => {
    closeMenu();
    if (!cur) return;
    try {
      const res = await fetch(mediaUrl, { mode: "cors" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = cur.kind === "video" ? "mp4" : "jpg";
      a.download = `hxfwb-${overlay?.postId || "media"}-${i + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(cur.kind === "video" ? "Đã tải video" : "Đã lưu ảnh");
    } catch {
      // Fallback: open in a new tab
      window.open(mediaUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = async () => {
    closeMenu();
    if (!overlay?.onDeletePost) return;
    if (!window.confirm("Bạn muốn xóa bài viết này?")) return;
    try {
      await overlay.onDeletePost();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Không xóa được bài viết");
    }
  };

  const handleReport = () => {
    closeMenu();
    overlay?.onReportPost?.();
    onClose();
  };

  return (
    <Portal>
      <div
        onClick={() => { if (menuOpen) { setMenuOpen(false); return; } onClose(); }}
        role="dialog"
        aria-modal="true"
        data-scroll-lock-ignore
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483600,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          animation: "fadeInBackdrop 0.22s ease-out",
        }}
      >
        {/* Top gradient — readability for header overlay */}
        <div
          aria-hidden
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 140,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)",
            pointerEvents: "none",
            zIndex: 2147483601,
          }}
        />

        {/* Story-style header: avatar + name + menu + close */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "max(env(safe-area-inset-top, 0px), 12px)",
            left: 12,
            right: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 2147483602,
          }}
        >
          <img loading="lazy" decoding="async"
            src={avatarSrc(overlay?.authorAvatar || "/placeholder.svg", 64)}
            alt=""
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              objectFit: "cover",
              boxShadow: "0 0 0 2px rgba(255,255,255,0.5)",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1, lineHeight: 1.15 }}>
            <div
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              }}
            >
              {overlay?.authorName || "Người dùng"}
            </div>
            {multi ? (
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 500 }}>
                {i + 1}/{items.length}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label="Tuỳ chọn"
            style={headerBtnStyle}
          >
            <MoreHorizontal size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Đóng"
            style={headerBtnStyle}
          >
            <X size={20} />
          </button>
        </div>

        {/* Media area — fills the viewport */}
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start == null || !multi) return;
            const end = e.changedTouches[0]?.clientX ?? start;
            const dx = end - start;
            if (Math.abs(dx) < 40) return;
            if (dx < 0) goNext(); else goPrev();
          }}
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            display: "grid",
            placeItems: "center",
            padding: 0,
            position: "relative",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {cur.kind === "video" ? (
            <video controlsList="nodownload" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
              key={cur.url}
              src={cur.url}
              autoPlay
              controls
              playsInline
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "100vw",
                maxHeight: "100dvh",
                objectFit: "contain",
                background: "#000",
                animation: "popIn 0.22s cubic-bezier(.2,.8,.2,1)",
              }}
            />
          ) : (
            <img loading="lazy" decoding="async"
              key={cur.url}
              src={mediaUrl}
              alt={`${alt} ${i + 1}`}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "100vw",
                maxHeight: "100dvh",
                objectFit: "contain",
                animation: "popIn 0.22s cubic-bezier(.2,.8,.2,1)",
              }}
            />
          )}

          {multi && i > 0 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Trước" style={navStyle("left")}>
              <ChevronLeft size={24} />
            </button>
          ) : null}
          {multi && i < items.length - 1 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Sau" style={navStyle("right")}>
              <ChevronRight size={24} />
            </button>
          ) : null}
        </div>

        {/* Action sheet (...) */}
        {menuOpen ? (
          <div
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2147483610,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              animation: "fadeInBackdrop 0.18s ease-out",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 480,
                background: "#18181b",
                color: "#fff",
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
              }}
            >
              <div
                style={{
                  margin: "10px auto 6px",
                  width: 40,
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.25)",
                }}
              />
              {isOwner ? (
                <>
                  <MenuItem
                    icon={<Link2 size={18} />}
                    label="Sao chép liên kết"
                    onClick={() => { closeMenu(); void copy(postUrl, "Đã sao chép liên kết"); }}
                  />
                  <MenuItem
                    icon={<Trash2 size={18} />}
                    label="Xóa bài viết"
                    danger
                    onClick={handleDelete}
                  />
                </>
              ) : (
                <>
                  <MenuItem
                    icon={<Link2 size={18} />}
                    label="Sao chép liên kết"
                    onClick={() => { closeMenu(); void copy(postUrl, "Đã sao chép liên kết"); }}
                  />
                  <MenuItem
                    icon={<Flag size={18} />}
                    label="Báo cáo"
                    danger
                    onClick={handleReport}
                  />
                </>
              )}
              <button
                type="button"
                onClick={closeMenu}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  padding: "14px 16px",
                  marginTop: 4,
                  background: "transparent",
                  border: 0,
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Huỷ
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Portal>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 20px",
        background: "transparent",
        border: 0,
        color: danger ? "#f87171" : "#fff",
        fontSize: 15,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ display: "inline-flex", width: 22, justifyContent: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const headerBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  background: "rgba(0,0,0,0.45)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  flexShrink: 0,
};

function lbActionStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    background: "transparent",
    border: 0,
    color,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "color 0.2s ease, transform 0.15s ease",
  };
}

const lbInputIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  background: "transparent",
  border: 0,
  color: "rgba(255,255,255,0.85)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  flexShrink: 0,
};

/* ============================== Helpers ============================== */

function iconBtnStyle(pos: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}): React.CSSProperties {
  return {
    position: "absolute",
    ...pos,
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "none",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    zIndex: 2,
  };
}

const playOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
};

const playCircleStyle: React.CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.15)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.25)",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
};

function navStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 16,
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "none",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  } as React.CSSProperties;
}
