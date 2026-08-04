import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/candy/portal";
import { PostDetailPage } from "@/components/candy/post-detail-page";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X } from "lucide-react";

interface CommentSheetProps {
  open: boolean;
  postId: string;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
}

/**
 * Task #5.3:
 *   • Mobile → bottom sheet (giữ hành vi cũ).
 *   • Desktop (≥768px) → popup dialog trung tâm, giống Facebook.
 *   • Khi popup mở → đặt body[data-modal-open="true"] để ẩn Bottom Dock
 *     (CSS xử lý trong styles.css).
 */
function useIsDesktop(breakpoint = 768) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  const [is, setIs] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setIs(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpoint]);
  return is;
}

export function CommentSheet({ open, postId, onClose, onViewProfile }: CommentSheetProps) {
  useBodyScrollLock(open);
  const isDesktop = useIsDesktop();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragState = useRef<{ startY: number; active: boolean; scrollTop: number }>({
    startY: 0,
    active: false,
    scrollTop: 0,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  // Ẩn Bottom Navigation khi popup mở (áp dụng cả mobile bottom sheet & desktop dialog).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.getAttribute("data-modal-open");
    document.body.setAttribute("data-modal-open", "true");
    return () => {
      if (prev) document.body.setAttribute("data-modal-open", prev);
      else document.body.removeAttribute("data-modal-open");
    };
  }, [open]);

  if (!open) return null;

  const handleHandleTouchStart = (e: React.TouchEvent) => {
    dragState.current.startY = e.touches[0].clientY;
    dragState.current.active = true;
  };
  const handleHandleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.current.active) return;
    const dy = e.touches[0].clientY - dragState.current.startY;
    if (dy > 0) setDragY(dy);
  };
  const handleHandleTouchEnd = () => {
    dragState.current.active = false;
    if (dragY > 120) onClose();
    else setDragY(0);
  };

  const containerStyle: React.CSSProperties = isDesktop
    ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(720px, 92vw)",
        height: "min(85vh, 820px)",
        background: "hsl(var(--background))",
        borderRadius: 20,
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "fadeInBackdrop 0.18s ease-out",
      }
    : {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        top: "6vh",
        background: "hsl(var(--background))",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        boxShadow:
          "0 -20px 60px -20px rgba(0,0,0,0.55), inset 0 1px 0 hsl(0 0% 100% / 0.05)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transform: `translateY(${dragY}px)`,
        transition: dragState.current.active
          ? "none"
          : "transform 0.28s cubic-bezier(.2,.8,.2,1)",
        animation: "slideUp 0.28s cubic-bezier(.2,.8,.2,1)",
        willChange: "transform",
      };

  return (
    <Portal>
      <div
        className="comment-sheet-backdrop"
        onClick={onClose}
        onWheel={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9990,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(10px) saturate(150%)",
          WebkitBackdropFilter: "blur(10px) saturate(150%)",
          animation: "fadeInBackdrop 0.18s ease-out",
        }}
      >
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Bình luận"
          onClick={(e) => e.stopPropagation()}
          style={containerStyle}
        >
          {/* iOS drag handle — chỉ hiện trên mobile (bottom sheet) */}
          {!isDesktop && (
            <div
              onTouchStart={handleHandleTouchStart}
              onTouchMove={handleHandleTouchMove}
              onTouchEnd={handleHandleTouchEnd}
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "10px 0 4px",
                flexShrink: 0,
                cursor: "grab",
                touchAction: "none",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  background: "hsl(var(--muted-foreground) / 0.35)",
                }}
              />
            </div>
          )}
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isDesktop ? "14px 18px" : "4px 16px 12px",
              borderBottom: "1px solid hsl(var(--border) / 0.4)",
              flexShrink: 0,
              background: "hsl(var(--background))",
            }}
          >
            <span style={{ width: 34 }} />
            <strong
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
              }}
            >
              Bình luận
            </strong>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              style={{
                background: "hsl(var(--muted) / 0.6)",
                border: 0,
                width: 34,
                height: 34,
                display: "grid",
                placeItems: "center",
                borderRadius: 999,
                cursor: "pointer",
                color: "hsl(var(--foreground))",
              }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
          <div
            data-scroll-lock-ignore
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              overscrollBehavior: "contain",
              touchAction: "pan-y",
            }}
          >
            <PostDetailPage postId={postId} onViewProfile={onViewProfile} embedded />
          </div>
        </div>
      </div>
    </Portal>
  );
}
