/**
 * VipMediaSourceSelector — "Nguồn Media VIP" (Tạo tài khoản hàng loạt + gán clone).
 *
 * 3 chế độ:
 *   1. Random toàn bộ
 *   2. Random theo thư mục
 *   3. Chọn bằng tay  → mở đúng kho "Quản Lý Icon VIP"
 *
 * NGUỒN DUY NHẤT: bảng public.vip_icons ("Quản Lý Icon VIP").
 * KHÔNG đọc gif_library (Kho GIF dùng chung), không còn bảng vip_gifs.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search } from "lucide-react";
import { MediaItem } from "@/components/admin-v3/MediaItem";
import {
  fetchVipIconFolders,
  fetchVipIcons,
  VIP_DEFAULT_FOLDER,
  type VipIcon,
  type VipMediaPickMode,
  type VipMediaSelection,
} from "@/lib/vip-assets";

export type VipMediaSourceValue = VipMediaSelection;

export const DEFAULT_VIP_MEDIA_SELECTION: VipMediaSourceValue = {
  mode: "all",
  folder: null,
  urls: [],
};

const MODE_LABEL: Record<VipMediaPickMode, string> = {
  all: "Random toàn bộ",
  folder: "Random theo thư mục",
  selected: "Chọn bằng tay",
};

export function VipMediaSourceSelector({
  value,
  onChange,
  compact,
}: {
  value: VipMediaSourceValue;
  onChange: (v: VipMediaSourceValue) => void;
  compact?: boolean;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const [rows, setRows] = useState<VipIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const selectedUrls = useMemo(() => value.urls ?? [], [value.urls]);
  const selectedSet = useMemo(() => new Set(selectedUrls), [selectedUrls]);

  useEffect(() => {
    fetchVipIconFolders()
      .then(setFolders)
      .catch(() => setFolders([VIP_DEFAULT_FOLDER]));
  }, []);

  // Lưới media chỉ cần khi chọn tay.
  useEffect(() => {
    if (value.mode !== "selected") return;
    setLoading(true);
    fetchVipIcons({ activeOnly: true, folder: value.folder || null })
      .then((list) => {
        const term = search.trim().toLowerCase();
        setRows(term ? list.filter((r) => (r.name || "").toLowerCase().includes(term)) : list);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [value.mode, value.folder, search, reloadKey]);

  const setMode = (mode: VipMediaPickMode) =>
    onChange({ ...value, mode, folder: mode === "all" ? null : value.folder ?? "" });

  /** Giữ ĐÚNG thứ tự Admin click (thêm vào cuối, bỏ thì giữ thứ tự còn lại). */
  const toggle = (url: string) => {
    const next = selectedSet.has(url)
      ? selectedUrls.filter((u) => u !== url)
      : [...selectedUrls, url];
    onChange({ ...value, urls: next });
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium">Nguồn Media VIP</div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(MODE_LABEL) as VipMediaPickMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`admv3-btn ${value.mode === m ? "" : "admv3-btn-ghost"} text-xs`}
          >
            {value.mode === m ? <Check size={13} /> : null} {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {(value.mode === "folder" || value.mode === "selected") && (
        <label className="block text-xs">
          <span className="text-muted-foreground">Thư mục trong Quản Lý Icon VIP</span>
          <select
            className="admv3-input mt-1"
            value={value.folder ?? ""}
            onChange={(e) => onChange({ ...value, folder: e.target.value || null })}
          >
            <option value="">Tất cả thư mục</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}

      {value.mode === "selected" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
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

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Đã chọn <strong>{selectedUrls.length}</strong> media (giữ đúng thứ tự)
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="underline"
                onClick={() => onChange({ ...value, urls: rows.map((g) => g.url) })}
                disabled={!rows.length}
              >
                Chọn tất cả ({rows.length})
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => onChange({ ...value, urls: [] })}
                disabled={!selectedUrls.length}
              >
                Bỏ chọn
              </button>
            </span>
          </div>

          {loading ? (
            <div className="text-xs text-muted-foreground py-3 text-center">Đang tải kho Icon VIP…</div>
          ) : !rows.length ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              Kho trống. Vào menu “Quản lý Icon VIP” để upload.
            </div>
          ) : (
            <div
              className="grid gap-2 overflow-auto"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
                maxHeight: compact ? 180 : 260,
              }}
            >
              {rows.map((g) => {
                const order = selectedUrls.indexOf(g.url);
                const on = order >= 0;
                return (
                  <button
                    key={g.id}
                    type="button"
                    title={g.name}
                    onClick={() => toggle(g.url)}
                    className={`relative rounded-md border p-1 grid place-items-center ${
                      on ? "border-primary bg-primary/10" : "hover:bg-muted"
                    }`}
                    style={{ height: 64 }}
                  >
                    <MediaItem
                      url={g.url}
                      alt={g.name}
                      style={{ maxWidth: "100%", maxHeight: 52, objectFit: "contain" }}
                    />
                    {on && (
                      <span className="absolute top-0.5 right-0.5 rounded-full bg-primary text-primary-foreground grid place-items-center h-4 w-4 text-[9px] font-bold">
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Mô tả ngắn lựa chọn hiện tại (hiển thị trên nút / toast). */
export function describeVipMediaSelection(v: VipMediaSourceValue): string {
  if (v.mode === "all") return "Random toàn bộ Media VIP";
  if (v.mode === "folder") return `Random thư mục: ${v.folder || "Tất cả"}`;
  return `Random trong ${v.urls?.length ?? 0} media đã chọn`;
}
