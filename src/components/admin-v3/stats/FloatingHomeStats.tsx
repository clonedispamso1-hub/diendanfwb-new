import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Activity, AlertTriangle, ChevronLeft, Home, Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { avatarSrc } from "@/lib/image-cdn";
import {
  fetchActiveNowUsers,
  fetchAdminStatsSummary,
  fetchNewTodayUsers,
  fetchUnseenCounts,
  type AdminStatsSummary,
  type AdminStatsUserRow,
} from "@/components/admin-v3/stats/stats-queries";
import "@/styles/admin-stats-v4.css";

type Position = { x: number; y: number };
type Viewport = { width: number; height: number };
type DetailKind = "new" | "active";

const STORAGE_KEY = "admv3-floating-home-position-v1";
const SEEN_NEW_KEY = "admv3-floating-home-seen-new-v1";
const SEEN_ACTIVE_KEY = "admv3-floating-home-seen-active-v1";
const BUTTON_SIZE = 56;
const PANEL_WIDTH = 272;
const PANEL_HEIGHT = 186;
const GAP = 10;
const MARGIN = 12;
const UNSEEN_REFRESH_MS = 60_000;

function defaultPosition(viewport: Viewport): Position {
  return {
    x: Math.max(MARGIN, viewport.width - BUTTON_SIZE - 22),
    y: Math.max(MARGIN, viewport.height - BUTTON_SIZE - 120),
  };
}

function clampPosition(pos: Position, viewport: Viewport): Position {
  const maxX = Math.max(MARGIN, viewport.width - BUTTON_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, viewport.height - BUTTON_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, pos.x), maxX),
    y: Math.min(Math.max(MARGIN, pos.y), maxY),
  };
}

function readSavedPosition(viewport: Viewport): Position {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPosition(viewport);
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return defaultPosition(viewport);
    return clampPosition({ x: parsed.x, y: parsed.y }, viewport);
  } catch {
    return defaultPosition(viewport);
  }
}

function savePosition(pos: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Position memory is optional.
  }
}

function readStamp(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStamp(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Optional.
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 120_000) return "Đang online";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return fmtTime(iso);
}

export function FloatingHomeStats() {
  const [viewport, setViewport] = useState<Viewport>({ width: 390, height: 760 });
  const [position, setPosition] = useState<Position>({ x: 312, y: 584 });
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [summary, setSummary] = useState<AdminStatsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminStatsUserRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [unseen, setUnseen] = useState({ newUnseen: 0, activeUnseen: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchAdminStatsSummary("all"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thống kê");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnseen = useCallback(async () => {
    try {
      setUnseen(await fetchUnseenCounts(readStamp(SEEN_NEW_KEY), readStamp(SEEN_ACTIVE_KEY)));
    } catch {
      // Badge là phụ trợ, lỗi thì bỏ qua.
    }
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      setViewport(next);
      setPosition((current) => clampPosition(current, next));
    };
    const next = { width: window.innerWidth, height: window.innerHeight };
    setViewport(next);
    setPosition(readSavedPosition(next));
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    void refreshUnseen();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshUnseen();
    }, UNSEEN_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshUnseen]);

  useEffect(() => {
    if (open && !summary && !loading) void load();
  }, [load, loading, open, summary]);

  const openDetail = useCallback(
    async (kind: DetailKind) => {
      setDetail(kind);
      setRows([]);
      setRowsLoading(true);
      setListError(null);
      try {
        const data =
          kind === "new" ? await fetchNewTodayUsers(50) : await fetchActiveNowUsers(50);
        setRows(data);
        // Đánh dấu đã xem.
        writeStamp(kind === "new" ? SEEN_NEW_KEY : SEEN_ACTIVE_KEY, new Date().toISOString());
        setUnseen((prev) => (kind === "new" ? { ...prev, newUnseen: 0 } : { ...prev, activeUnseen: 0 }));
      } catch (err) {
        setListError(err instanceof Error ? err.message : "Không tải được danh sách");
      } finally {
        setRowsLoading(false);
      }
    },
    [],
  );

  const badgeTotal = unseen.newUnseen + unseen.activeUnseen;

  const buttonStyle = useMemo<CSSProperties>(
    () => ({ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }),
    [position.x, position.y],
  );

  const panelStyle = useMemo<CSSProperties>(() => {
    const height = detail ? Math.min(360, Math.max(240, viewport.height - 2 * MARGIN)) : PANEL_HEIGHT;
    const width = Math.min(PANEL_WIDTH, viewport.width - 2 * MARGIN);
    const left = Math.min(Math.max(MARGIN, position.x - width + BUTTON_SIZE), Math.max(MARGIN, viewport.width - width - MARGIN));
    const below = position.y + BUTTON_SIZE + GAP;
    const above = position.y - height - GAP;
    const top = below + height + MARGIN <= viewport.height ? below : Math.max(MARGIN, above);
    return { left, top, width };
  }, [detail, position.x, position.y, viewport.height, viewport.width]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }, viewport));
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      suppressClickUntilRef.current = Date.now() + 250;
      const next = clampPosition(
        { x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY },
        viewport,
      );
      setPosition(next);
      savePosition(next);
    }
  };

  return (
    <div className="admv3-floating-home-layer" aria-live="polite">
      {open ? (
        <section className="admv3-floating-home-panel" style={panelStyle} aria-label="Thống kê nhanh">
          <header className="admv3-floating-home-panel-head">
            <div className="admv3-floating-home-head-main">
              {detail ? (
                <button
                  className="admv3-floating-home-icon-btn"
                  type="button"
                  onClick={() => { setDetail(null); setRows([]); setListError(null); }}
                  aria-label="Quay lại"
                >
                  <ChevronLeft size={15} />
                </button>
              ) : null}
              <div>
                <div className="admv3-floating-home-title">
                  {detail === "new" ? "Đăng ký mới hôm nay" : detail === "active" ? "Đang hoạt động" : "Thống kê nhanh"}
                </div>
                <div className="admv3-floating-home-sub">
                  {detail
                    ? rowsLoading
                      ? "Đang tải danh sách…"
                      : `${rows.length} thành viên`
                    : "Dữ liệu từ trang Thống kê"}
                </div>
              </div>
            </div>
            <button className="admv3-floating-home-icon-btn" type="button" onClick={() => setOpen(false)} aria-label="Đóng">
              <X size={15} />
            </button>
          </header>

          {detail ? (
            <div className="admv3-floating-home-list">
              {rowsLoading ? (
                <div className="admv3-floating-home-list-empty"><Loader2 size={14} className="sv4-spin" /> Đang tải…</div>
              ) : listError ? (
                <div className="admv3-floating-home-list-empty" style={{ color: "#dc2626", flexDirection: "column" }}>
                  <span><AlertTriangle size={14} /> Không tải được danh sách</span>
                  <span style={{ fontSize: 10.5 }}>{listError}</span>
                </div>
              ) : rows.length === 0 ? (
                <div className="admv3-floating-home-list-empty">
                  {detail === "new" ? "Hôm nay chưa có ai đăng ký" : "Hiện không có ai đang online"}
                </div>
              ) : (
                rows.map((u) => (
                  <div className="admv3-floating-home-row" key={u.id}>
                    <span className="admv3-floating-home-avatar">
                      {u.avatar
                        ? <img loading="lazy" decoding="async" src={avatarSrc(u.avatar, 64)} alt="" />
                        : <span>{(u.full_name || u.username || "?")[0]?.toUpperCase()}</span>}
                    </span>
                    <span className="admv3-floating-home-row-main">
                      <span className="admv3-floating-home-row-name">{u.full_name || u.username || "Không tên"}</span>
                      <span className="admv3-floating-home-row-meta">UID: {u.public_id || u.id.slice(0, 8)}</span>
                    </span>
                    <span className="admv3-floating-home-row-time">
                      {detail === "new"
                        ? fmtTime(u.created_at)
                        : u.is_online
                          ? "Đang online"
                          : fmtAgo(u.last_seen)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="admv3-floating-home-stats">
              <button className="admv3-floating-home-stat is-clickable" type="button" onClick={() => void openDetail("new")}>
                <span className="admv3-floating-home-stat-icon is-blue"><UserPlus size={16} /></span>
                <span className="admv3-floating-home-stat-label">
                  Đăng ký mới hôm nay
                  {unseen.newUnseen > 0 ? <em className="admv3-floating-home-mini-badge">{unseen.newUnseen}</em> : null}
                </span>
                <strong>{loading && !summary ? "…" : (summary?.newToday ?? 0).toLocaleString("vi-VN")}</strong>
              </button>
              <button className="admv3-floating-home-stat is-clickable" type="button" onClick={() => void openDetail("active")}>
                <span className="admv3-floating-home-stat-icon is-green"><Activity size={16} /></span>
                <span className="admv3-floating-home-stat-label">
                  Đang hoạt động
                  {unseen.activeUnseen > 0 ? <em className="admv3-floating-home-mini-badge">{unseen.activeUnseen}</em> : null}
                </span>
                <strong>{loading && !summary ? "…" : (summary?.activeNow ?? 0).toLocaleString("vi-VN")}</strong>
              </button>
            </div>
          )}

          <footer className="admv3-floating-home-footer">
            {error ? <span className="admv3-floating-home-error">{error}</span> : <span />}
            <button
              className="admv3-floating-home-refresh"
              type="button"
              onClick={() => {
                if (detail) void openDetail(detail);
                else void load();
                void refreshUnseen();
              }}
              disabled={loading || rowsLoading}
            >
              {loading || rowsLoading ? <Loader2 size={14} className="sv4-spin" /> : <RefreshCw size={14} />}
              Làm mới
            </button>
          </footer>
        </section>
      ) : null}

      <button
        className="admv3-floating-home-button"
        type="button"
        style={buttonStyle}
        aria-label="Mở thống kê nhanh"
        title="Thống kê nhanh"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onClick={(event) => {
          if (Date.now() < suppressClickUntilRef.current) {
            event.preventDefault();
            return;
          }
          setOpen((value) => {
            if (value) setDetail(null);
            return !value;
          });
        }}
      >
        <Home size={22} />
        {badgeTotal > 0 ? (
          <span className="admv3-floating-home-badge">{badgeTotal > 99 ? "99+" : badgeTotal}</span>
        ) : null}
      </button>
    </div>
  );
}
