/**
 * VipMediaPickerPanel — HỆ THỐNG 2 (Admin Panel).
 *
 * Lưới chọn Media VIP: Folder, Search, Random, Multi Select KHÔNG giới hạn
 * số lượng và GIỮ ĐÚNG THỨ TỰ Admin đã chọn.
 *
 * NGUỒN DUY NHẤT: bảng vip_icons — "Quản Lý Icon VIP" (Cloudinary `vip/icons/*`).
 * KHÔNG đọc gif_library, KHÔNG import component của Kho GIF.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, Shuffle } from "lucide-react";
import { VipMedia } from "@/components/vip/vip-media";
import {
  VIP_DEFAULT_FOLDER,
  fetchVipIconFolders,
  fetchVipIcons,
} from "@/lib/vip-assets";

type Row = { id: string; name: string; url: string; folder?: string };

export function VipMediaPickerPanel({
  selected,
  onChange,
  maxHeight = 300,
}: {
  selected: string[];
  onChange: (urls: string[]) => void;
  maxHeight?: number;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    fetchVipIconFolders()
      .then(setFolders)
      .catch(() => setFolders([VIP_DEFAULT_FOLDER]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = fetchVipIcons({ activeOnly: true, folder: folder || null });
    q.then((list: any[]) => {
      if (!alive) return;
      const term = search.trim().toLowerCase();
      setRows(
        (list as Row[]).filter((r) => !term || (r.name || "").toLowerCase().includes(term)),
      );
    })
      .catch(() => setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [folder, search, reloadKey]);

  /** Giữ ĐÚNG thứ tự click: thêm vào cuối, bỏ chọn giữ thứ tự còn lại. */
  const toggle = (url: string) => {
    onChange(selectedSet.has(url) ? selected.filter((u) => u !== url) : [...selected, url]);
  };

  const randomPick = (n: number) => {
    const pool = rows.map((r) => r.url);
    if (!pool.length) return;
    const bag = pool.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    onChange(bag.slice(0, Math.min(n, bag.length)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className="admv3-input h-8 text-xs"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">Tất cả thư mục</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[140px]">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            className="admv3-input pl-7 h-8 text-xs w-full"
            placeholder="Tìm theo tên…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="admv3-btn admv3-btn-ghost admv3-btn-icon"
          title="Tải lại"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Random:</span>
        {[1, 3, 5, 10, 20].map((n) => (
          <button key={n} type="button" className="admv3-btn admv3-btn-ghost text-[11px]" onClick={() => randomPick(n)}>
            <Shuffle size={11} /> {n}
          </button>
        ))}
        <button type="button" className="underline" onClick={() => onChange(rows.map((r) => r.url))}>
          Chọn tất cả ({rows.length})
        </button>
        <button type="button" className="underline" onClick={() => onChange([])}>
          Bỏ chọn
        </button>
        <span className="ml-auto text-muted-foreground">
          Đã chọn <strong>{selected.length}</strong>
        </span>
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-muted-foreground">Đang tải kho Media VIP…</div>
      ) : !rows.length ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          Kho Media VIP đang trống. Vào Admin → Quản lý Icon VIP để upload.
        </div>
      ) : (
        <div
          className="grid gap-2 overflow-auto rounded-lg border p-2 bg-muted/20"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", maxHeight }}
        >
          {rows.map((r) => {
            const on = selectedSet.has(r.url);
            return (
              <button
                key={r.id}
                type="button"
                title={r.name}
                onClick={() => toggle(r.url)}
                className={`relative rounded-md border p-1 grid place-items-center ${on ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                style={{ height: 64 }}
              >
                <VipMedia url={r.url} width="100%" height={52} alt={r.name} />
                {on ? (
                  <span className="absolute top-0.5 right-0.5 rounded-full bg-primary text-primary-foreground grid place-items-center h-4 w-4 text-[9px] font-bold">
                    {selected.indexOf(r.url) + 1}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
