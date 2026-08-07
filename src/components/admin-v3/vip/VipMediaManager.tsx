/**
 * Admin — ENGINE của KHO SỐ 2: "Quản Lý Icon VIP" (Icon / GIF / WEBM / MP4).
 *
 * Hoàn toàn ĐỘC LẬP với Kho GIF dùng chung:
 *  - Dữ liệu: bảng public.vip_icons — NGUỒN DUY NHẤT của mọi Media VIP.
 *  - Cloudinary: folder `vip/icons/*`.
 *  - Chỉ xuất hiện trong Admin Panel; chỉ Admin + Clone dùng được.
 *
 * Preview dùng đúng component `MediaItem` của Kho GIF:
 *  gif/png/webp/svg → <img>, webm/mp4 → <video autoplay muted loop playsInline>.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, Eye, EyeOff, FolderPlus, ImagePlus, Loader2, RefreshCw, Save, Shuffle, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MediaItem } from "../MediaItem";
import {
  VIP_DEFAULT_FOLDER,
  VIP_MEDIA_ACCEPT,
  createVipIconFolder,
  deleteVipIcon,
  fetchVipIconFolders,
  fetchVipIcons,
  moveVipIcon,
  renameVipIcon,
  setVipIconActive,
  uploadVipIcon,
  type VipIcon,
} from "@/lib/vip-assets";

type Row = VipIcon;

export interface VipMediaManagerProps {
  title: string;
  description: string;
}

export function VipMediaManager({ title, description }: VipMediaManagerProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [folders, setFolders] = useState<string[]>([VIP_DEFAULT_FOLDER]);
  const [folder, setFolder] = useState(VIP_DEFAULT_FOLDER);
  const [filterFolder, setFilterFolder] = useState("");
  const [q, setQ] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, fs] = await Promise.all([
        fetchVipIcons({ folder: null }),
        fetchVipIconFolders().catch(() => [VIP_DEFAULT_FOLDER]),
      ]);
      setRows(list as Row[]);
      setFolders(fs.length ? fs : [VIP_DEFAULT_FOLDER]);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được kho VIP");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!term || (r.name || "").toLowerCase().includes(term)) &&
        (!filterFolder || (r.folder || VIP_DEFAULT_FOLDER) === filterFolder),
    );
  }, [rows, q, filterFolder]);

  async function addFolder() {
    const name = newFolder.trim();
    if (!name) { toast.error("Tên thư mục trống"); return; }
    try {
      const clean = await createVipIconFolder(name);
      setFolders((f) => (f.includes(clean) ? f : [...f, clean]));
      setFolder(clean);
      setNewFolder("");
      toast.success(`Đã tạo thư mục “${clean}”`);
    } catch (e: any) {
      toast.error(e?.message || "Không tạo được thư mục");
    }
  }

  async function onPickFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setUploading(true);
    let ok = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setProgress(`${i + 1}/${list.length} · ${file.name}`);
        try {
          await uploadVipIcon(file, { folder });
          ok++;
        } catch (e: any) {
          toast.warning(`Lỗi “${file.name}”: ${e?.message || "upload thất bại"}`);
        }
      }
      if (ok) toast.success(`Đã thêm ${ok} mục vào kho VIP`);
      await reload();
    } finally {
      setUploading(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleActive(row: Row) {
    try {
      await setVipIconActive(row.id, !row.is_active);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_active: !row.is_active } : r)));
    } catch (e: any) { toast.error(e?.message || "Không đổi được trạng thái"); }
  }

  async function saveRow(row: Row) {
    try {
      await renameVipIcon(row.id, row.name);
      await moveVipIcon(row.id, row.folder || VIP_DEFAULT_FOLDER);
      toast.success("Đã lưu");
    } catch (e: any) { toast.error(e?.message || "Lưu thất bại"); }
  }

  async function removeRow(row: Row) {
    if (!confirm(`Xoá “${row.name}” khỏi kho VIP?`)) return;
    try {
      await deleteVipIcon(row);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success("Đã xoá");
    } catch (e: any) { toast.error(e?.message || "Xoá thất bại"); }
  }

  /** Random 1 mục (theo thư mục đang lọc) — xem nhanh như Kho GIF. */
  const [randomUrl, setRandomUrl] = useState("");
  function randomOne() {
    const pool = visible.filter((r) => r.is_active);
    if (!pool.length) { toast.error("Kho VIP đang trống"); return; }
    setRandomUrl(pool[Math.floor(Math.random() * pool.length)].url);
  }

  return (
    <div className="space-y-3 max-w-6xl">
      <div className="admv3-card p-3 space-y-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">Thư mục lưu</div>
            <select className="admv3-input w-full" value={folder} onChange={(e) => setFolder(e.target.value)}>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-xs text-muted-foreground">Tạo thư mục mới</div>
            <div className="flex gap-1">
              <input
                className="admv3-input flex-1"
                placeholder="Tên thư mục…"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addFolder(); } }}
              />
              <button className="admv3-btn" type="button" onClick={() => void addFolder()}><FolderPlus size={14} /></button>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="admv3-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload lên Cloudinary
          </button>
          <input ref={fileRef} type="file" hidden multiple accept={VIP_MEDIA_ACCEPT}
            onChange={(e) => void onPickFiles(e.target.files)} />
          <button className="admv3-btn admv3-btn-ghost" onClick={randomOne}><Shuffle size={14} /> Random xem thử</button>
          <span className="text-xs text-muted-foreground">
            Lưu vào Cloudinary: vip/icons/… · Thư mục: {folder}
          </span>
        </div>

        {uploading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Đang tải lên… {progress}
          </div>
        ) : null}

        {randomUrl ? (
          <div className="flex items-center gap-2">
            <MediaItem url={randomUrl} className="h-20 w-20 object-contain bg-black/5 rounded" />
            <span className="text-xs text-muted-foreground">Kết quả random (chỉ để xem thử)</span>
          </div>
        ) : null}
      </div>

      <div className="admv3-card p-3 flex items-center gap-2 flex-wrap">
        <select className="admv3-input" value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)}>
          <option value="">Tất cả thư mục ({rows.length})</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input className="admv3-input flex-1 min-w-[200px]" placeholder="Tìm theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="admv3-btn admv3-btn-ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin inline mr-2" /> Đang tải…
        </div>
      ) : !visible.length ? (
        <div className="admv3-card p-6 text-center text-sm text-muted-foreground">
          <ImagePlus size={22} className="inline mr-2 opacity-60" /> Kho VIP chưa có mục nào.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {visible.map((row) => (
            <div key={row.id} className={`admv3-card p-2 space-y-2 ${row.is_active ? "" : "opacity-60"}`}>
              <MediaItem url={row.url} alt={row.name} className="w-full h-36 object-contain bg-black/5 rounded" />
              <input
                className="admv3-input"
                value={row.name}
                onChange={(e) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
              />
              <select
                className="admv3-input w-full"
                value={row.folder || VIP_DEFAULT_FOLDER}
                onChange={(e) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, folder: e.target.value } : r)))}
              >
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <button className="admv3-btn flex-1" onClick={() => void saveRow(row)}><Save size={12} /> Lưu</button>
                <button className="admv3-btn admv3-btn-ghost" title={row.is_active ? "Đang bật" : "Đang tắt"} onClick={() => void toggleActive(row)}>
                  {row.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button className="admv3-btn admv3-btn-ghost text-red-500" onClick={() => void removeRow(row)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
        <ArrowUp size={11} /> Kho này KHÔNG bao giờ hiển thị trong picker GIF của người dùng ngoài website.
      </div>
    </div>
  );
}

export default VipMediaManager;
