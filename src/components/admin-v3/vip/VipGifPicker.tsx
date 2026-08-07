/**
 * <VipGifPicker /> — Popup chọn "VIP GIF" CHỈ dành cho Admin Panel
 * (đăng bài / bình luận / nhắn tin bằng tài khoản thứ hai).
 *
 * NGUỒN DUY NHẤT: bảng vip_icons — "Quản Lý Icon VIP (Media VIP)".
 * TUYỆT ĐỐI KHÔNG đọc gif_library (Kho GIF dùng chung).
 * Người dùng thường không bao giờ thấy component này (chỉ import trong admin-v3).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Crown, RefreshCw, Search, X } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { VipMedia } from "@/components/vip/vip-media";
import { VIP_DEFAULT_FOLDER, fetchVipIconFolders, fetchVipIcons } from "@/lib/vip-assets";

type Row = { id: string; name: string; url: string; folder?: string };

const PANEL_W = 340;
const PANEL_H = 420;

function computePosition(anchor: HTMLElement | null) {
  if (!anchor || typeof window === "undefined") return { top: 80, left: 16, maxHeight: PANEL_H };
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const below = spaceBelow >= Math.min(PANEL_H, spaceAbove);
  const maxHeight = Math.max(200, Math.min(PANEL_H, below ? spaceBelow : spaceAbove));
  const left = Math.min(Math.max(8, rect.left), Math.max(8, vw - PANEL_W - 8));
  const top = below ? rect.bottom + 8 : Math.max(8, rect.top - maxHeight - 8);
  return { top, left, maxHeight };
}

export function VipGifPicker({
  open,
  onClose,
  onPick,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pos, setPos] = useState({ top: 80, left: 16, maxHeight: PANEL_H });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setPos(computePosition(anchorRef?.current ?? null));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    fetchVipIconFolders()
      .then(setFolders)
      .catch(() => setFolders([VIP_DEFAULT_FOLDER]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetchVipIcons({ activeOnly: true, folder: folder || null })
      .then((list: any[]) => {
        if (!alive) return;
        const term = search.trim().toLowerCase();
        setRows((list as Row[]).filter((r) => !term || (r.name || "").toLowerCase().includes(term)));
      })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, folder, search, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  const folderList = useMemo(() => ["", ...folders], [folders]);

  if (!open) return null;

  return (
    <Portal>
      <div
        ref={panelRef}
        className="rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
        style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_W, zIndex: 9999 }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Crown size={15} className="text-amber-500" />
          <span className="text-sm font-semibold">VIP GIF</span>
          <span className="text-[11px] text-muted-foreground">Quản Lý Icon VIP</span>
          <button className="ml-auto p-1 rounded hover:bg-muted" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button className="p-1 rounded hover:bg-muted" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 flex-1 rounded-lg border border-border px-2 py-1">
            <Search size={13} className="text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm icon VIP…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="rounded-lg border border-border bg-transparent text-xs px-1.5 py-1"
          >
            {folderList.map((f) => (
              <option key={f || "all"} value={f}>
                {f || "Tất cả"}
              </option>
            ))}
          </select>
        </div>

        <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: pos.maxHeight - 90 }}>
          {loading && !rows.length ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Đang tải…</div>
          ) : !rows.length ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Chưa có media trong Quản Lý Icon VIP.
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  title={r.name}
                  onClick={() => {
                    onPick(r.url);
                    onClose();
                  }}
                  className="aspect-square rounded-lg border border-border bg-muted/30 grid place-items-center p-1 hover:border-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  <VipMedia url={r.url} width="100%" height="100%" alt={r.name} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

export default VipGifPicker;
