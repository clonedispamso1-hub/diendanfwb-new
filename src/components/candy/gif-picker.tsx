/**
 * GifPicker — KHO SỐ 1: popup GIF dùng chung cho TOÀN BỘ website
 * (bình luận, đăng bài, chat, hồ sơ).
 *
 * CHỈ đọc kho chung `gif_library` (GIF / Sticker / Icon công khai).
 * KHÔNG đọc vip_icons / vip_media và KHÔNG import component
 * của hệ thống Quản lý Icon VIP.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Search, X, Sticker, ImageIcon as LucideImage, Smile,
  History, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  fetchGifPage,
  getRecentGifs,
  pushRecentGif,
  type GifItem,
  type GifKind,
} from "@/lib/gif-pack";
import { Portal } from "@/components/candy/portal";
import { LibraryMedia } from "@/components/candy/library-media";

interface GifPickerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the media URL of the chosen GIF / sticker. */
  onPick: (url: string) => void;
  /** Anchor element the popup floats above/below. Required for `popover`. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** popover = floating popup (default), inline = render inside parent. */
  variant?: "popover" | "inline";
}

type TabKey = GifKind | "recent";

const PAGE_SIZE = 12;

const TABS: { key: TabKey; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "gif", label: "GIF", Icon: LucideImage },
  { key: "sticker", label: "Sticker", Icon: Sticker },
  { key: "icon", label: "Icon", Icon: Smile },
  { key: "recent", label: "Gần đây", Icon: History },
];


/** Computes fixed viewport coords + max height for the popup, flipping
 *  above the anchor when there is not enough space below (Facebook style).
 *  The popup NEVER overflows the viewport: its height is capped to the
 *  available space in whichever direction was chosen. */
function computePosition(
  anchor: HTMLElement | null,
  width: number,
  preferredHeight: number,
) {
  if (!anchor || typeof window === "undefined") {
    return { top: 80, left: 16, maxHeight: preferredHeight, placement: "below" as const };
  }
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;
  const gap = 10;
  const minHeight = 260;
  const spaceAbove = Math.max(0, rect.top - margin - gap);
  const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
  // Facebook/Zalo behavior: ALWAYS anchor to the GIF icon and open ABOVE it
  // by default. Only flip below when there isn't enough room above.
  const openAbove = spaceAbove >= minHeight || spaceAbove >= spaceBelow;
  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(minHeight, Math.min(preferredHeight, available));
  const top = openAbove
    ? Math.max(margin, rect.top - gap - maxHeight)
    : Math.min(vh - maxHeight - margin, rect.bottom + gap);
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(vw - width - margin, Math.max(margin, left));
  return { top, left, maxHeight, placement: openAbove ? ("above" as const) : ("below" as const) };
}

export function GifPicker({ open, onClose, onPick, anchorRef, variant = "popover" }: GifPickerProps) {
  // KHO SỐ 1 (dùng chung): picker ngoài website CHỈ đọc media công khai của
  // bảng gif_library. Tuyệt đối không đọc kho VIP (vip_icons / vip_media).
  const levels = useMemo(() => ["public"] as const, []);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("gif");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number }>({
    top: 80,
    left: 16,
    maxHeight: 420,
  });

  const PANEL_W = 340;
  const PANEL_H = 460;

  // Mobile => bottom sheet (Zalo/Messenger style) thay vì popover nhỏ.
  const [isMobile, setIsMobile] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => { if (open) setDragY(0); }, [open]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Loads a single page (LIMIT + OFFSET) — never the whole library. */
  const load = useCallback(
    async (nextPage: number, nextTab: TabKey, nextQuery: string) => {
      
      if (nextTab === "recent") {
        const all = getRecentGifs().filter((i) =>
          nextQuery.trim()
            ? i.label.toLowerCase().includes(nextQuery.trim().toLowerCase())
            : true,
        );
        setTotal(all.length);
        setItems(all.slice((nextPage - 1) * PAGE_SIZE, nextPage * PAGE_SIZE));
        return;
      }
      setLoading(true);
      try {
        const res = await fetchGifPage(nextTab, nextPage, PAGE_SIZE, nextQuery, { levels: [...levels] });
        setItems(res.items);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [levels],
  );


  // Reset to page 1 whenever the tab or the query changes.
  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, tab, query]);

  // Debounced page load.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(page, tab, query), query ? 220 : 0);
    return () => window.clearTimeout(t);
  }, [open, page, tab, query, load]);

  // Position popover relative to anchor. Recomputes on resize, scroll (any
  // ancestor via capture), and when the anchor itself moves (ResizeObserver).
  useLayoutEffect(() => {
    if (!open || variant !== "popover" || isMobile) return;
    const reposition = () => {
      const { top, left, maxHeight } = computePosition(
        anchorRef?.current ?? null,
        PANEL_W,
        PANEL_H,
      );
      setPos({ top, left, maxHeight });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    let ro: ResizeObserver | null = null;
    if (anchorRef?.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(reposition);
      ro.observe(anchorRef.current);
    }
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      ro?.disconnect();
    };
  }, [open, variant, anchorRef, isMobile]);

  // ESC + click outside.
  useEffect(() => {
    if (!open || variant === "inline") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const timer = window.setTimeout(
      () => document.addEventListener("mousedown", onDown),
      0,
    );
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, variant, onClose, anchorRef]);

  const handlePick = (item: GifItem) => {
    pushRecentGif(item);
    onPick(item.url);
  };

  if (!open) return null;

  const sheetMode = variant === "popover" && isMobile;

  const panel = (
    <div
      ref={panelRef}
      className={
        sheetMode
          ? "gif-picker gif-picker--sheet"
          : variant === "popover"
            ? "gif-picker gif-picker--floating"
            : "gif-picker"
      }
      role="dialog"
      aria-label="Chọn GIF hoặc sticker"
      style={
        sheetMode
          ? { transform: dragY ? `translateY(${dragY}px)` : undefined }
          : variant === "popover"
          ? {
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: PANEL_W,
              height: pos.maxHeight,
              display: "flex",
              flexDirection: "column",
            }
          : undefined
      }
    >
      {sheetMode ? (
        <div
          className="gif-picker__handle"
          onTouchStart={(e) => { dragStart.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (dragStart.current == null) return;
            const dy = e.touches[0].clientY - dragStart.current;
            if (dy > 0) setDragY(dy);
          }}
          onTouchEnd={() => {
            if (dragY > 110) onClose();
            else setDragY(0);
            dragStart.current = null;
          }}
        >
          <span />
        </div>
      ) : null}

      <div className="gif-picker__head">
        <div className="gif-picker__tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`gif-picker__tab${tab === t.key ? " is-active" : ""}${t.key === "recent" ? " gif-picker__tab--recent" : ""}`}
              onClick={() => setTab(t.key)}
              aria-label={t.label}
              title={t.label}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <t.Icon size={15} />
              {t.key === "recent" ? null : <span>{t.label}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="gif-picker__close" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>
      </div>

      <div className="gif-picker__search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm GIF, sticker…"
          aria-label="Tìm GIF"
        />
      </div>


      <div className="gif-picker__body" data-scroll-lock-ignore>
        <div className="gif-picker__grid">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="gif-picker__item"
              style={{ position: "relative" }}
              title={item.label}
              onClick={() => handlePick(item)}
            >
              <LibraryMedia url={item.url} alt={item.label} />
            </button>
          ))}
          {!loading && items.length === 0 ? (
            <p className="gif-picker__empty">
              {tab === "recent"
                ? "Bạn chưa sử dụng GIF nào."
                : query
                  ? "Không có kết quả."
                  : "Thư viện đang trống."}
            </p>
          ) : null}
          {loading && items.length === 0 ? (
            <p className="gif-picker__empty">Đang tải…</p>
          ) : null}
        </div>
      </div>


      {(
      <div className="gif-picker__pager">
        <button
          type="button"
          className="gif-picker__pager-btn"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          aria-label="Trang trước"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="gif-picker__pager-info">
          Trang {Math.min(page, totalPages)} / {totalPages}
        </span>
        <button
          type="button"
          className="gif-picker__pager-btn"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          aria-label="Trang sau"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      )}

    </div>
  );

  if (variant === "inline") return panel;
  return (
    <Portal>
      <div className={`gif-picker-portal-layer${sheetMode ? " is-sheet" : ""}`}>
        {sheetMode ? (
          <div className="gif-picker__backdrop" onClick={onClose} aria-hidden />
        ) : null}
        {panel}
      </div>
    </Portal>
  );
}
