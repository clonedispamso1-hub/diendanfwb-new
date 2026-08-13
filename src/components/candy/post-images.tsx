import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { getMediaUrl as cdnUrl, getMediaThumb } from "@/lib/media";

interface PostImagesProps {
  images: string[];
  alt?: string;
}

type Orientation = "landscape" | "portrait" | "square" | "unknown";

/**
 * Premium post image grid:
 *  1 image  → full width, capped height, smart portrait cropping + "Xem toàn bộ ảnh"
 *  2 images → balanced split
 *  3 images → Pinterest-style (1 large + 2 stacked)
 *  4 images → clean 2x2 grid
 *  5+       → 2 large on top + 3 small below ("+N" overlay)
 */
export function PostImages({ images, alt = "Ảnh bài viết" }: PostImagesProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [orient, setOrient] = useState<Orientation>("unknown");

  const PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect fill='#1a1a1a' width='400' height='400'/><text x='50%' y='50%' fill='#888' font-family='sans-serif' font-size='18' text-anchor='middle' dominant-baseline='middle'>Ảnh không khả dụng</text></svg>`,
    );

  // Bản gốc: CHỈ dùng khi người dùng bấm mở lightbox.
  const optimized = useMemo(() => {
    const valid = (images || []).filter(
      (u) => typeof u === "string" && /^(https?:|data:|blob:)/.test(u.trim()),
    );
    return valid.map((u) => cdnUrl(u) || PLACEHOLDER);
  }, [images]);

  // Bản thumbnail hiển thị trong feed/grid — không bao giờ tải ảnh gốc.
  const thumbs = useMemo(
    () =>
      optimized.map((u, i) =>
        u === PLACEHOLDER ? u : getMediaThumb(u, i === 0 ? 720 : 480) || u,
      ),
    [optimized],
  );

  if (optimized.length === 0) return null;

  const count = optimized.length;
  const layout: "one" | "two" | "three" | "four" | "many" =
    count === 1 ? "one" : count === 2 ? "two" : count === 3 ? "three" : count === 4 ? "four" : "many";
  const visible = layout === "many" ? thumbs.slice(0, 5) : thumbs;
  const extra = layout === "many" ? count - 5 : 0;

  const onSingleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const ratio = w / h;
    setOrient(ratio < 0.85 ? "portrait" : ratio > 1.15 ? "landscape" : "square");
    setLoaded((s) => ({ ...s, 0: true }));
  };

  const renderCell = (src: string, i: number, isSingle: boolean, label?: string) => (
    <button
      key={src + i}
      type="button"
      className={`post-grid-cell${loaded[i] ? " is-loaded" : ""}`}
      onClick={() => setLightbox(i)}
      aria-label={`Xem ảnh ${i + 1}`}
    >
      <img
        src={src}
        alt={`${alt} ${i + 1}`}
        loading="lazy"
        decoding="async"
        fetchPriority={i === 0 ? "high" : "low"}
        onLoad={isSingle ? onSingleLoad : () => setLoaded((s) => ({ ...s, [i]: true }))}
        onError={(e) => {
          if (e.currentTarget.src !== PLACEHOLDER) e.currentTarget.src = PLACEHOLDER;
          setLoaded((s) => ({ ...s, [i]: true }));
        }}
        draggable={false}
      />
      {label ? <span className="post-grid-overlay">{label}</span> : null}
      {isSingle ? (
        <>
          <span className="post-grid-fade" aria-hidden="true" />
          <span className="post-grid-viewall">
            <Maximize2 size={12} aria-hidden="true" /> Xem toàn bộ ảnh
          </span>
        </>
      ) : null}
    </button>
  );

  return (
    <>
      <div
        className={`post-grid post-grid--uniform post-grid--${layout}`}
        data-count={count}
      >
        {visible.map((src, i) =>
          renderCell(
            src,
            i,
            false,
            layout === "many" && i === 4 && extra > 0 ? `+${extra}` : undefined,
          ),
        )}
      </div>

      {lightbox !== null ? (
        <Lightbox
          images={optimized}
          startIndex={lightbox}
          alt={alt}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

function Lightbox({ images, startIndex, alt, onClose }: { images: string[]; startIndex: number; alt: string; onClose: () => void }) {
  const [i, setI] = useState(startIndex);
  const multi = images.length > 1;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const goPrev = useCallback(() => { setI((v) => Math.max(0, v - 1)); }, []);
  const goNext = useCallback(() => { setI((v) => Math.min(images.length - 1, v + 1)); }, [images.length]);

  useBodyScrollLock(true);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPadding: body.style.paddingRight,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
    };
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.paddingRight = prev.bodyPadding;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouchAction;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    prevFocusRef.current = (document.activeElement as HTMLElement) || null;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      const el = prevFocusRef.current;
      if (el && typeof el.focus === "function") {
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (multi && e.key === "ArrowLeft") { e.preventDefault(); goPrev(); return; }
      if (multi && e.key === "ArrowRight") { e.preventDefault(); goNext(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multi, goPrev, goNext, onClose]);

  useEffect(() => {
    const preload = (src?: string) => {
      if (!src) return;
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    };
    preload(images[i + 1]);
    preload(images[i - 1]);
  }, [i, images]);

  // Touch: swipe to navigate or swipe down to close. No zoom in lightbox.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); else goPrev();
      return;
    }
    // Swipe down to close
    if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      onClose();
    }
  };

  return (
    <Portal>
      <div
        className="modal-backdrop lightbox-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          animation: "fadeInBackdrop 0.2s ease-out",
          background: "rgba(0,0,0,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        aria-describedby={descId}
      >
        <h2 id={titleId} className="sr-only">Trình xem ảnh</h2>
        <p id={descId} className="sr-only">
          Ảnh {i + 1} trên {images.length}. Mũi tên trái/phải để chuyển, +/- để zoom, Esc để đóng.
        </p>
        <div
          ref={panelRef}
          className="lightbox-panel"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ animation: "popIn 0.22s cubic-bezier(.2,.8,.2,1)" }}
        >
          <button ref={closeBtnRef} className="lightbox-close" onClick={onClose} aria-label="Đóng" type="button">
            <X size={28} aria-hidden="true" />
          </button>
          <img
            className="lightbox-image max-h-full max-w-full object-contain m-auto"
            src={images[i]}
            alt={`${alt} ${i + 1}`}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
          {multi ? (
            <>
              {i > 0 ? (
                <button className="lightbox-nav prev" onClick={goPrev} aria-label="Ảnh trước" type="button">
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
              ) : null}
              {i < images.length - 1 ? (
                <button className="lightbox-nav next" onClick={goNext} aria-label="Ảnh sau" type="button">
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              ) : null}
              <div className="lightbox-counter" role="status" aria-live="polite">{i + 1} / {images.length}</div>
            </>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
