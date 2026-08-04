import { type ReactNode, useEffect } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { AnimatePresence, motion, type PanInfo, useMotionValue, useTransform } from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  children: ReactNode;
  /** mobile height in vh (default 85) */
  height?: number;
}

/**
 * Premium mobile-first bottom sheet with:
 * - Framer Motion spring slide-up
 * - Drag-down to dismiss (velocity-based)
 * - Backdrop tap to close
 * - Desktop: centered floating modal-sheet
 */
export function BottomSheet({
  open,
  onClose,
  title,
  leftAction,
  rightAction,
  children,
  height = 85,
}: BottomSheetProps) {
  // Lock body scroll + touch bleed-through while open (shared hook).
  useBodyScrollLock(open);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 320], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 140 || info.velocity.y > 500) {
      onClose();
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="bsheet-root" aria-modal="true" role="dialog">
          <motion.div
            className="bsheet-backdrop"
            style={{ opacity: backdropOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="bsheet"
            style={{ y, ["--bsheet-h" as any]: `${height}vh` }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <div className="bsheet-handle-wrap" aria-hidden>
              <div className="bsheet-handle" />
            </div>

            {/* Sticky header */}
            <div className="bsheet-header">
              <div className="bsheet-header-side bsheet-header-left">
                {leftAction ?? (
                  <button type="button" className="bsheet-cancel" onClick={onClose}>
                    Hủy
                  </button>
                )}
              </div>
              <div className="bsheet-title">{title}</div>
              <div className="bsheet-header-side bsheet-header-right">
                {rightAction ?? (
                  <button
                    type="button"
                    className="bsheet-close-icon"
                    onClick={onClose}
                    aria-label="Đóng"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="bsheet-body">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default BottomSheet;
