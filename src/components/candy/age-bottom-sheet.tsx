/**
 * AgeBottomSheet — bộ chọn tuổi dạng Bottom Sheet (giống TikTok / Shopee).
 *
 * CHỈ UI: không đổi logic, không đổi kiểu dữ liệu (vẫn trả về number).
 * - Trượt từ dưới lên, scroll mượt + inertia (-webkit-overflow-scrolling: touch)
 * - Mỗi item cao 50px, bấm 1 lần là chọn → tự đóng → cập nhật giá trị ngay
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export function ageLabel(a: number): string {
  return a >= 60 ? "60+ tuổi" : `${a} tuổi`;
}

export function AgeSheet({
  open,
  value,
  options,
  title = "Chọn tuổi",
  onClose,
  onSelect,
}: {
  open: boolean;
  value: number | "";
  options: number[];
  title?: string;
  onClose: () => void;
  onSelect: (v: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => {
      listRef.current
        ?.querySelector<HTMLElement>(".age-sheet-item.is-selected")
        ?.scrollIntoView({ block: "center" });
    }, 120);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="age-sheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="age-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="age-sheet-grip" aria-hidden="true" />
            <div className="age-sheet-head">
              <span>{title}</span>
              <button type="button" className="age-sheet-x" onClick={onClose} aria-label="Đóng">
                <ChevronDown size={18} strokeWidth={2.6} />
              </button>
            </div>

            <div className="age-sheet-list" ref={listRef}>
              {options.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`age-sheet-item${value === a ? " is-selected" : ""}`}
                  onClick={() => {
                    onSelect(a);
                    onClose();
                  }}
                >
                  <span>{ageLabel(a)}</span>
                  {value === a ? <Check size={17} strokeWidth={3} /> : null}
                </button>
              ))}
            </div>

            <div className="age-sheet-foot">
              <button type="button" className="age-sheet-cancel" onClick={onClose}>
                Hủy
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
