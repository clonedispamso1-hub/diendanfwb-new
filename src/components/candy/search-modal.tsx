import { useEffect, useLayoutEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "@/components/candy/portal";
import { SearchSheet } from "@/components/candy/search-sheet";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onViewProfile: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
}

/**
 * "Tìm kiếm thông minh" dropdown panel (Facebook/Discord style).
 * - Slides down right under the app header, no dark overlay, no centered dialog.
 * - Closes via the X button, Escape, or a click outside the panel.
 */
export function SearchModal({ open, onClose, onViewProfile, onOpenPost }: SearchModalProps) {
  const [box, setBox] = useState({ top: 64, left: 16, width: 640 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const header = document.querySelector(".app-header") as HTMLElement | null;
      const rect = header?.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(680, vw - 24);
      setBox({
        top: (rect ? rect.bottom : 56) + 8,
        left: Math.max(12, (vw - width) / 2),
        width,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-search-panel]")) return;
      if (t.closest(".app-header__right")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="search-dropdown"
            data-search-panel
            role="dialog"
            aria-label="Tìm kiếm thông minh"
            className="fixed rounded-2xl bg-background border border-border shadow-2xl flex flex-col overflow-hidden"
            style={{
              zIndex: 9990,
              top: box.top,
              left: box.left,
              width: box.width,
              maxHeight: "min(70vh, 560px)",
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1 text-sm font-semibold truncate">Tìm kiếm thông minh</div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted text-foreground/70 hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <SearchSheet
                onClose={() => {}}
                onViewProfile={onViewProfile}
                onOpenPost={onOpenPost}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
