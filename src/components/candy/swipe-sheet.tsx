import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

interface SwipeSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional ARIA label. */
  ariaLabel?: string;
  /** Drop-shadow accent color for the top edge. */
  accent?: string;
}

/**
 * Full-screen bottom sheet with a drag handle and swipe-down-to-close gesture.
 * Used for Search and Notifications popups so we never leave the underlying
 * page (no navigation = scroll position is preserved automatically).
 */
export function SwipeSheet({ open, onClose, children, ariaLabel, accent }: SwipeSheetProps) {
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 400], [1, 0.2]);

  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) y.set(0);
  }, [open, y]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      onClose();
    } else {
      y.set(0);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="ss-backdrop"
            className="fixed inset-0"
            style={{
              zIndex: 9990,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              opacity: backdropOpacity as unknown as number,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
        )}
        {open && (
          <motion.div
            key="ss-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="fixed left-0 right-0 bottom-0"
            style={{
              zIndex: 9991,
              top: 0,
              y,
              display: "flex",
              flexDirection: "column",
              background: "hsl(var(--background))",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              boxShadow: `0 -20px 60px -20px ${accent || "rgba(244,114,182,0.35)"}, 0 0 0 1px hsl(var(--border) / 0.4)`,
              overflow: "hidden",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            {/* Drag handle row — assigns drag via a nested motion.div with listener */}
            <motion.div
              data-sheet-drag
              className="w-full flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragMomentum={false}
              onDrag={(_, info) => y.set(Math.max(0, info.offset.y))}
              onDragEnd={handleDragEnd}
              style={{ touchAction: "none" }}
            >
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 999,
                  background: "hsl(var(--muted-foreground) / 0.45)",
                }}
              />
            </motion.div>

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
