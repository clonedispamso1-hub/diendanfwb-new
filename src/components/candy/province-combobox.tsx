import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, ChevronDown, Search, X, Check } from "lucide-react";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { normalizeVi, scoreProvince } from "@/lib/province-search";
import { useIsMobile } from "@/hooks/use-mobile";
import { Portal } from "@/components/candy/portal";

/** Alias + normalize dùng chung toàn site: @/lib/province-search */
const normalize = normalizeVi;

type Scored = { name: string; score: number };

/** Số item render tối đa mỗi lần (tránh render 63 tỉnh + animation gây giật iOS). */
const PAGE_SIZE = 24;

export interface ProvinceComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export function ProvinceCombobox({
  value,
  onChange,
  placeholder = "Tìm tỉnh / thành phố",
  disabled,
  required,
  id,
}: ProvinceComboboxProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [activeIdx, setActiveIdx] = useState(0);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Track trigger position for desktop portalized panel (survives overflow-hidden ancestors).
  useEffect(() => {
    if (!open || isMobile) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPanelRect({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, isMobile]);

  // Debounce search 140ms — gõ nhanh không rescore toàn bộ danh sách.
  useEffect(() => {
    const t = setTimeout(() => setDeferredQuery(query), 140);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo<Scored[]>(() => {
    const scored = VN_PROVINCES.map((name) => ({ name, score: scoreProvince(name, deferredQuery) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name, "vi");
      });
    return scored;
  }, [deferredQuery]);

  const visible = useMemo(() => results.slice(0, limit), [results, limit]);

  useEffect(() => {
    setActiveIdx(0);
    setLimit(PAGE_SIZE);
  }, [deferredQuery, open]);

  // Focus search khi mở
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Đóng khi click ngoài (desktop)
  useEffect(() => {
    if (!open || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        listRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, isMobile]);

  // Khoá scroll body khi mở bottom sheet
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const select = useCallback(
    (name: string) => {
      onChange(name);
      setOpen(false);
      setQuery("");
      // trả focus về trigger, không mất focus khỏi form
      setTimeout(() => triggerRef.current?.focus(), 0);
    },
    [onChange],
  );

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      // giữ focus trigger
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => {
        const next = Math.min(i + 1, Math.max(results.length - 1, 0));
        if (next >= limit - 1) setLimit((n) => n + PAGE_SIZE);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) select(item.name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  // scroll item active vào view
  useEffect(() => {
    const list = listRef.current?.querySelector<HTMLElement>("[data-list-scroll]");
    const el = list?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (el && list) {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
    }
  }, [activeIdx, results]);

  const displayValue = value || "";

  const panel = (
    <div className="pc-panel-inner" ref={listRef}>
      <div className="pc-search-wrap">
        <Search size={14} className="pc-search-icon" aria-hidden />
        <input
          ref={searchRef}
          className="pc-search-input"
          placeholder="Nhập tên tỉnh / thành phố…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Tìm kiếm tỉnh thành"
          autoComplete="off"
        />
      </div>
      <div
        className="pc-list"
        data-list-scroll
        role="listbox"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
            setLimit((n) => (n >= results.length ? n : n + PAGE_SIZE));
          }
        }}
      >
        {results.length === 0 && (
          <div className="pc-empty">Không tìm thấy tỉnh/thành phù hợp.</div>
        )}
        {visible.map((r, i) => {
          const selected = r.name === value;
          const active = i === activeIdx;
          return (
            <button
              type="button"
              key={r.name}
              data-idx={i}
              role="option"
              aria-selected={selected}
              className={`pc-item ${active ? "pc-item-active" : ""} ${selected ? "pc-item-selected" : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(r.name)}
            >
              <MapPin size={12} className="pc-item-icon" aria-hidden />
              <span className="pc-item-label">{r.name}</span>
              {selected && <Check size={14} className="pc-item-check" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="pc-root">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        className={`pc-trigger onboarding-input ${open ? "pc-trigger-open" : ""} ${!displayValue ? "pc-trigger-empty" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin size={14} className="pc-trigger-icon" aria-hidden />
        <span className="pc-trigger-value">
          {displayValue || placeholder}
        </span>
        {displayValue && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Xoá lựa chọn"
            className="pc-clear"
            onClick={clear}
            onMouseDown={(e) => e.preventDefault()}
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown
          size={16}
          className={`pc-chevron ${open ? "pc-chevron-open" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && !isMobile && panelRect && (
          <Portal>
            <motion.div
              key="desktop-panel"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="pc-panel-desktop pc-panel-desktop-fixed"
              style={{ top: panelRect.top, left: panelRect.left, width: panelRect.width }}
            >
              {panel}
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      <Portal>
        <AnimatePresence>
          {open && isMobile && (
            <>
              <motion.div
                key="sheet-backdrop"
                className="pc-sheet-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="sheet"
                className="pc-sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 34, stiffness: 320, mass: 0.9 }}
                role="dialog"
                aria-label="Chọn tỉnh / thành phố"
              >
                <div className="pc-sheet-handle" />
                <div className="pc-sheet-title">Chọn tỉnh / thành phố</div>
                {panel}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
