import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import {
  Upload, Loader2, Search, X, Sticker, ImageIcon as LucideImage, Smile,
  History, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  addSharedGif,
  classifyMedia,
  fetchGifPage,
  fetchSharedLibrary,
  getRecentGifs,
  invalidateSharedLibrary,
  pushRecentGif,
  type GifItem,
  type GifKind,
} from "@/lib/gif-pack";
import { uploadGifToStorage } from "@/lib/gif-storage";
import { useAuth } from "@/components/candy/auth-provider";
import { Portal } from "@/components/candy/portal";

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

/** Converts a short video into an animated GIF entirely in the browser. */
async function videoToGif(file: File): Promise<Blob> {
  const { encode } = await import("modern-gif");
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Không đọc được video"));
    });
    const duration = Math.min(video.duration || 3, 5);
    const fps = 8;
    const total = Math.max(1, Math.round(duration * fps));
    const scale = Math.min(1, 320 / (video.videoWidth || 320));
    const width = Math.max(2, Math.round((video.videoWidth || 320) * scale));
    const height = Math.max(2, Math.round((video.videoHeight || 240) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const frames: { data: Uint8ClampedArray; delay: number }[] = [];
    for (let i = 0; i < total; i++) {
      const t = (i / fps) % duration;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, width, height);
      frames.push({
        data: ctx.getImageData(0, 0, width, height).data,
        delay: Math.round(1000 / fps),
      });
    }
    const output = await encode({ width, height, frames: frames as never });
    return new Blob([output as unknown as ArrayBuffer], { type: "image/gif" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const { isAdmin } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>("gif");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
        const res = await fetchGifPage(nextTab, nextPage, PAGE_SIZE, nextQuery);
        setItems(res.items);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [],
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

  const handleUpload = async (file: File) => {
    const kind = classifyMedia(file);
    if (kind === "unsupported") {
      toast.error("Định dạng không được hỗ trợ.");
      return;
    }
    setUploading(true);
    try {
      let toSend: File = file;
      if (kind === "video") {
        toast("Đang chuyển video sang GIF…");
        const blob = await videoToGif(file);
        toSend = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".gif", { type: "image/gif" });
      }
      const { url } = await uploadGifToStorage(toSend, { isAdmin });
      const kindForTab: GifKind =
        tab === "sticker" || tab === "icon"
          ? tab
          : kind === "animated-sticker"
            ? "sticker"
            : "gif";
      const label = file.name.replace(/\.[^.]+$/, "");

      // ---- Admin upload = "save to shared library ONLY" ----
      // Per spec: never auto-select, never insert into composer, never post.
      // The uploaded item must appear in the library like any other item;
      // the admin must click it again to insert it, same as every user.
      const result = await addSharedGif({ url, kind: kindForTab, label, keywords: [] });
      if (!result.ok) {
        // Do NOT swallow the RLS error with a toast + local fallback: the
        // whole point is to update the shared library. Surface the real
        // reason so it can be fixed at the DB layer.
        throw new Error(result.error ?? "Không lưu được vào thư viện chung");
      }

      // Refresh the current page so the new item shows up in the grid.
      invalidateSharedLibrary();
      await fetchSharedLibrary(true);
      setTab(kindForTab);
      setPage(1);
      await load(1, kindForTab, "");
      toast.success("Đã lưu vào thư viện GIF.");
      // NOTE: intentionally NO onPick(url) here — admin must click the
      // item in the grid to insert it, exactly like any other user.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải lên thất bại");
    } finally {
      setUploading(false);
    }
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
              title={item.label}
              onClick={() => handlePick(item)}
            >
              <img src={item.url} alt={item.label} loading="lazy" decoding="async" />
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

      {isAdmin ? (
        <div className="gif-picker__foot">
          <button
            type="button"
            className="gif-picker__upload"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Chỉ admin có thể tải lên GIF/Sticker/Video → GIF"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span>{uploading ? "Đang xử lý…" : "Tải GIF / sticker / video (Admin)"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/gif,image/webp,image/png,video/*,.lottie,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleUpload(f);
            }}
          />
        </div>
      ) : null}
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
