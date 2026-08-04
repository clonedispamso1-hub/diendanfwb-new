import { useEffect, useId, useRef, useState } from "react";
import { X, Gauge, PictureInPicture2, ArrowLeft } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { getMediaUrl as cdnUrl } from "@/lib/media";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  mediaType?: "image" | "video";
}

export function ImageLightbox({ src, alt, onClose, mediaType = "image" }: ImageLightboxProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [speedOpen, setSpeedOpen] = useState(false);

  const WATERMARK = "CẤM SAO CHÉP & TẢI XUỐNG - WEBSTE CHỐNG CHỤP MÀN HÌNH";

  useBodyScrollLock(true);

  useEffect(() => {
    document.body.classList.add("lightbox-open");
    return () => document.body.classList.remove("lightbox-open");
  }, []);

  // NOTE: Scroll-lock is fully handled by `useBodyScrollLock(true)` above.
  // The previous inline duplicate captured already-locked body styles and
  // restored them on unmount, leaving `position: fixed` / `touch-action: none`
  // permanently applied → the app appeared frozen after closing a story.
  // Do NOT re-add a second scroll lock here.

  // Lưu/khôi phục focus
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

  // ESC + focus trap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") {
        const root = panelRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        if (focusables.length === 0) { e.preventDefault(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !root.contains(active)) { e.preventDefault(); last.focus(); }
        } else {
          if (active === last || !root.contains(active)) { e.preventDefault(); first.focus(); }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="modal-backdrop lightbox-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        style={{
          animation: "fadeInBackdrop 0.22s ease-out",
          background: "rgba(6, 8, 14, 0.86)",
          backdropFilter: "blur(10px) saturate(140%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
        onTouchMove={(e) => {
          if (e.target === e.currentTarget) e.preventDefault();
        }}
      >
        <h2 id={titleId} className="sr-only">Trình xem ảnh</h2>
        <p id={descId} className="sr-only">Nhấn Esc để đóng.</p>
        <div
          ref={panelRef}
          className="lightbox-panel"
          data-scroll-lock-ignore
          onClick={(e) => e.stopPropagation()}
          style={{
            animation: "popIn 0.22s cubic-bezier(.2,.8,.2,1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            boxShadow: "none",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          role="group"
          aria-label={alt || "Ảnh phóng to"}
        >
          <button
            ref={closeBtnRef}
            className="lightbox-close"
            onClick={onClose}
            aria-label="Đóng trình xem ảnh"
            type="button"
          >
            <X size={28} aria-hidden="true" />
          </button>
          {mediaType === "video" ? (
            <video disablePictureInPicture
              ref={videoRef}
              className="lightbox-image"
              src={src}
              controls
              autoPlay
              playsInline
              loop
              controlsList="nodownload noremoteplayback noplaybackrate nofullscreen"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY });
                setSpeedOpen(false);
              }}
              style={{
                aspectRatio: "auto",
                objectFit: "contain",
                width: "auto",
                height: "auto",
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: 12,
                background: "#000",
                display: "block",
              }}
            />
          ) : (
            <img
              className="lightbox-image"
              src={cdnUrl(src)}
              alt={alt}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                aspectRatio: "auto",
                objectFit: "contain",
                width: "auto",
                height: "auto",
                maxWidth: "100%",
                maxHeight: "85vh",
                display: "block",
                userSelect: "none",
                WebkitUserSelect: "none",
                pointerEvents: "auto",
              }}
            />
          )}

          {/* Diagonal repeating watermark — sits inside the panel so it covers
              both image and video popups consistently and can't be hidden by
              toggling a top-level overlay. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
              borderRadius: 12,
              backgroundImage:
                "repeating-linear-gradient(-30deg, transparent 0 110px, rgba(255,255,255,0.001) 110px 220px)",
              mixBlendMode: "screen",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "-50%",
                transform: "rotate(-28deg)",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "60px 40px",
                color: "rgba(255,255,255,0.18)",
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.3,
                whiteSpace: "nowrap",
                textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                userSelect: "none",
              }}
            >
              {Array.from({ length: 60 }).map((_, i) => (
                <span key={i}>{WATERMARK}</span>
              ))}
            </div>
          </div>

          {/* Custom video context menu — replaces native menu, no download */}
          {menu ? (
            <>
              <div
                onClick={() => { setMenu(null); setSpeedOpen(false); }}
                style={{ position: "fixed", inset: 0, zIndex: 60 }}
              />
              <div
                role="menu"
                style={{
                  position: "fixed",
                  top: Math.min(menu.y, window.innerHeight - 220),
                  left: Math.min(menu.x, window.innerWidth - 220),
                  zIndex: 61,
                  minWidth: 200,
                  background: "rgba(28,28,30,0.96)",
                  color: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  padding: 6,
                  fontSize: 14,
                  backdropFilter: "blur(10px)",
                }}
              >
                {!speedOpen ? (
                  <>
                    <button type="button" onClick={() => setSpeedOpen(true)} style={menuItem}>
                      <Gauge size={16} /> <span>Tốc độ phát</span>
                      <span style={{ marginLeft: "auto", opacity: 0.6 }}>›</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }) | null;
                          if (v?.requestPictureInPicture) await v.requestPictureInPicture();
                        } catch { /* noop */ }
                        setMenu(null);
                      }}
                      style={menuItem}
                    >
                      <PictureInPicture2 size={16} /> <span>Hình trong hình</span>
                    </button>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                    <button type="button" onClick={() => setMenu(null)} style={menuItem}>
                      <ArrowLeft size={16} /> <span>Đóng menu</span>
                    </button>
                  </>
                ) : (
                  <>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          if (videoRef.current) videoRef.current.playbackRate = r;
                          setMenu(null); setSpeedOpen(false);
                        }}
                        style={menuItem}
                      >
                        <span style={{ width: 16 }}>
                          {videoRef.current?.playbackRate === r ? "✓" : ""}
                        </span>
                        <span>{r === 1 ? "Bình thường" : `${r}x`}</span>
                      </button>
                    ))}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                    <button type="button" onClick={() => setSpeedOpen(false)} style={menuItem}>
                      <ArrowLeft size={16} /> <span>Quay lại</span>
                    </button>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "transparent",
  color: "inherit",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
};
