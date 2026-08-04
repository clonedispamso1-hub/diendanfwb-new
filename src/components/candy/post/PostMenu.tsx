import { useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, Link2, Hash, Pencil, Trash2, Flag } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { usePostCard } from "./post-card-context";

/**
 * PostMenu — the three-dot overflow control and its dropdown panel.
 * The panel is rendered through a Portal so it can float above card
 * clipping / stacking contexts and never gets cut off. Positioning is
 * derived from the trigger's viewport rect on open.
 */
export function PostMenu() {
  const {
    menuOpen, openPostMenu, setMenuOpen, canDelete, meId, copyUrl, copyUid,
    startEdit, removePost, openReport,
  } = usePostCard();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const stop = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const item = (fn: () => void | Promise<void>) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    void fn();
  };

  useLayoutEffect(() => {
    if (!menuOpen) { setPos(null); return; }
    const compute = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? 260;
      const panelHeight = panelRef.current?.offsetHeight ?? 200;
      const gap = 8;
      let left = rect.right - panelWidth;
      left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
      let top = rect.bottom + gap;
      if (top + panelHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - panelHeight - gap);
      }
      setPos({ top, left });
    };
    compute();
    // Re-compute after the panel has actually rendered (to use real size).
    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [menuOpen]);

  return (
    <div
      className="pc-menu-wrap"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="pc-icon-btn"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={openPostMenu}
        aria-label="Tuỳ chọn bài viết"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <MoreHorizontal size={18} />
      </button>
      {menuOpen ? (
        <Portal>
          <div
            className="pc-menu-backdrop"
            onPointerDown={(e) => { stop(e); setMenuOpen(false); }}
            onMouseDown={(e) => { stop(e); setMenuOpen(false); }}
            onClick={(e) => { stop(e); setMenuOpen(false); }}
          />
          <div
            ref={panelRef}
            className="pc-menu-panel pc-menu-panel--portal"
            role="menu"
            style={pos ? { top: pos.top, left: pos.left } : { opacity: 0, pointerEvents: "none" }}
            onClick={stop}
            onPointerDown={stop}
            onMouseDown={stop}
          >
            <div className="pc-menu" role="none">
              <button className="pc-menu-item" onClick={item(copyUrl)}>
                <Link2 size={16} /> Sao chép liên kết
              </button>
              <button className="pc-menu-item" onClick={item(copyUid)}>
                <Hash size={16} /> Sao chép Post UID
              </button>
              {canDelete ? (
                <>
                  <button className="pc-menu-item" onClick={item(startEdit)}>
                    <Pencil size={16} /> Chỉnh sửa bài viết
                  </button>
                  <button className="pc-menu-item pc-menu-item--danger" onClick={item(removePost)}>
                    <Trash2 size={16} /> Xóa bài viết
                  </button>
                </>
              ) : meId ? (
                <button className="pc-menu-item" onClick={item(openReport)}>
                  <Flag size={16} /> Báo cáo bài viết
                </button>
              ) : null}
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
