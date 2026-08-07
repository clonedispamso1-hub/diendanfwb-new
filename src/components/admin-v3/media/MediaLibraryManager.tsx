/**
 * Admin — KHO SỐ 1: "Kho GIF dùng chung" cho toàn bộ website.
 *
 * Đơn giản như bản cũ: chỉ Upload Cloudinary + Thêm bằng Link, phân loại
 * GIF / Sticker / Icon. KHÔNG có thư mục, KHÔNG có phân quyền (VIP/Admin).
 * Mọi mục ở đây đều công khai cho người dùng (bài viết, bình luận, tin nhắn,
 * hồ sơ, emoji picker).
 *
 * Kho Media VIP là hệ thống RIÊNG (bảng vip_icons) — xem
 * `src/components/admin-v3/vip/VipMediaManager.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Trash2, Upload, Save, ImagePlus, ArrowUp, ArrowDown, Link2, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { MediaItem } from "../MediaItem";

import { supabase } from "@/lib/supabase";
import { invalidateSharedLibrary, type GifKind } from "@/lib/gif-pack";
import {
  MEDIA_KINDS,
  fetchAllMedia,
  filterUploadableFiles,
  insertMediaRows,
  isSchemaError,
  markLegacySchema,
  uploadToCloudinary,
  CloudinaryPresetError,
  type MediaRow,
} from "@/lib/media-library";

/** Kho chung luôn lưu ở thư mục Cloudinary công khai. */
const PUBLIC_ROOT = "media/public";

export function MediaLibraryManager() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState("");
  const [tab, setTab] = useState<GifKind>("gif");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [defaultKind, setDefaultKind] = useState<GifKind>("gif");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Thêm bằng Link — chỉ lưu URL, không upload file.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkKind, setLinkKind] = useState<GifKind>("gif");
  const [linkSaving, setLinkSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const data = await fetchAllMedia();
      // Kho chung chỉ hiển thị mục công khai.
      setRows(data.filter((r) => (r.access_level ?? "public") === "public"));
      invalidateSharedLibrary();
    } catch (e: any) {
      toast.error(e?.message || "Không tải được kho media");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => r.kind === tab && (!term || r.label.toLowerCase().includes(term)));
  }, [rows, tab, q]);

  async function onPickFiles(files: FileList | null) {
    const picked = files ? Array.from(files) : [];
    if (!picked.length) return;
    const { valid: list, skipped } = filterUploadableFiles(picked);
    if (skipped.length) {
      toast.warning(`Bỏ qua ${skipped.length} file không hợp lệ (không phải ảnh/GIF/WebM hoặc file rỗng)`);
    }
    if (!list.length) {
      toast.error("Không có file ảnh/GIF/WebM hợp lệ nào để upload");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setProgress(0);
    const uploaded: { url: string; file: File }[] = [];
    const failed: { name: string; error: string }[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setUploadInfo(`${i + 1}/${list.length} · ${file.name}`);
        try {
          const res = await uploadToCloudinary(file, {
            root: PUBLIC_ROOT,
            onProgress: (pct) => setProgress(Math.round(((i + pct / 100) / list.length) * 100)),
          });
          if (!res.secureUrl) throw new Error("Không nhận được secure_url từ Cloudinary");
          uploaded.push({ url: res.secureUrl, file });
        } catch (err: any) {
          if (err instanceof CloudinaryPresetError) {
            toast.error(err.message, { duration: 8000 });
            return;
          }
          const message = err?.message || "Upload thất bại";
          failed.push({ name: file.name, error: message });
          toast.warning(`Lỗi file “${file.name}”: ${message}`);
        }
      }

      if (!uploaded.length) {
        toast.error(`Upload Cloudinary thất bại: ${failed[0]?.error || "Không rõ nguyên nhân"}`);
        return;
      }
      if (failed.length) toast.warning(`${failed.length} file lỗi, đã bỏ qua`);

      await insertMediaRows(
        uploaded.map(({ url, file }) => ({
          url,
          kind: defaultKind,
          label: (file.name ?? "gif").replace(/\.[^.]+$/, "").slice(0, 40),
          folderName: "",
          accessLevel: "public",
        })),
      );
      toast.success(`Đã thêm ${uploaded.length} ${defaultKind.toUpperCase()}`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Lưu vào kho thất bại");
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadInfo("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Kiểm tra URL có hiển thị được như ảnh trong trình duyệt hay không. */
  function checkImageUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ""; resolve(false); }, 12000);
      img.onload = () => { clearTimeout(timer); resolve(true); };
      img.onerror = () => { clearTimeout(timer); resolve(false); };
      img.referrerPolicy = "no-referrer";
      img.src = url;
    });
  }

  /** Lưu media bằng link — KHÔNG upload, chỉ lưu URL. */
  async function saveLink() {
    const url = linkUrl.trim();
    if (!url) { toast.error("Vui lòng nhập link GIF"); return; }
    let parsed: URL;
    try { parsed = new URL(url); } catch { toast.error("URL không hợp lệ"); return; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      toast.error("URL phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    setLinkSaving(true);
    try {
      const isVideo = /\.(webm|mp4)(\?|#|$)/i.test(url);
      if (!isVideo) {
        const ok = await checkImageUrl(url);
        if (!ok) { toast.error("Link không hiển thị được ảnh/GIF. Hãy kiểm tra lại URL."); return; }
      }
      const fallbackName = decodeURIComponent(parsed.pathname.split("/").pop() || "gif")
        .replace(/\.[^.]+$/, "")
        .slice(0, 40);
      await insertMediaRows([{
        url,
        kind: linkKind,
        label: (linkName.trim() || fallbackName || "gif").slice(0, 40),
        folderName: "",
        accessLevel: "public",
      }]);
      toast.success("Đã thêm bằng link");
      setLinkOpen(false);
      setLinkUrl(""); setLinkName("");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setLinkSaving(false);
    }
  }

  async function saveRow(row: MediaRow) {
    const full = {
      label: row.label,
      kind: row.kind,
      keywords: row.keywords ?? [],
      sort_order: row.sort_order ?? 0,
      access_level: "public",
    };
    const base = { label: row.label, kind: row.kind, keywords: row.keywords ?? [], sort_order: row.sort_order ?? 0 };
    try {
      let { error } = await supabase.from("gif_library" as any).update(full).eq("id", row.id);
      if (error && isSchemaError(error)) {
        markLegacySchema();
        ({ error } = await supabase.from("gif_library" as any).update(base).eq("id", row.id));
      }
      if (error) throw error;
      toast.success("Đã lưu");
      invalidateSharedLibrary();
    } catch (e: any) { toast.error(e?.message || "Lưu thất bại"); }
  }

  async function deleteMany(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Xoá ${ids.length} mục?`)) return;
    try {
      const { error } = await supabase.from("gif_library" as any).delete().in("id", ids);
      if (error) throw error;
      toast.success(`Đã xoá ${ids.length}`);
      setSelected(new Set());
      await reload();
    } catch (e: any) { toast.error(e?.message || "Xoá thất bại"); }
  }

  async function move(row: MediaRow, dir: -1 | 1) {
    const list = visible;
    const idx = list.findIndex((r) => r.id === row.id);
    const neighbor = list[idx + dir];
    if (!neighbor) return;
    const a = row.sort_order ?? idx * 10;
    const b = neighbor.sort_order ?? (idx + dir) * 10;
    try {
      await supabase.from("gif_library" as any).update({ sort_order: b }).eq("id", row.id);
      await supabase.from("gif_library" as any).update({ sort_order: a }).eq("id", neighbor.id);
      await reload();
    } catch (e: any) { toast.error(e?.message || "Không đổi vị trí được"); }
  }

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  return (
    <div className="space-y-3 max-w-6xl">
      <div className="admv3-card p-3 space-y-3">
        <div>
          <div className="font-semibold">Kho GIF dùng chung</div>
          <div className="text-xs text-muted-foreground">
            GIF / Sticker / Icon dùng cho toàn bộ website: đăng bài, bình luận, nhắn tin, hồ sơ, emoji picker.
          </div>
        </div>

        <label className="space-y-1 block max-w-[240px]">
          <div className="text-xs text-muted-foreground">Loại upload</div>
          <select className="admv3-input w-full" value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as GifKind)}>
            {MEDIA_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="admv3-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload Cloudinary
          </button>
          <button className="admv3-btn" onClick={() => setLinkOpen(true)} disabled={uploading}>
            <Link2 size={14} /> Upload Link
          </button>
          <input ref={fileRef} type="file" hidden multiple accept="image/*,video/webm,video/mp4,.gif,.webm,.mp4,.png,.webp,.svg"
            onChange={(e) => void onPickFiles(e.target.files)} />
          <span className="text-xs text-muted-foreground">Sẽ lưu: {defaultKind.toUpperCase()}</span>
        </div>

        {uploading ? (
          <div className="space-y-1">
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Đang tải lên… {progress}% {uploadInfo ? `· ${uploadInfo}` : ""}
            </div>
          </div>
        ) : null}
      </div>

      <div className="admv3-card p-3 flex items-center gap-2 flex-wrap">
        {MEDIA_KINDS.map((k) => (
          <button key={k.key} className={`admv3-btn ${tab === k.key ? "" : "admv3-btn-ghost"}`} onClick={() => setTab(k.key)}>
            {k.label} ({rows.filter((r) => r.kind === k.key).length})
          </button>
        ))}
        <input className="admv3-input flex-1 min-w-[200px]" placeholder="Tìm theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="admv3-btn admv3-btn-ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
        {selected.size > 0 ? (
          <button className="admv3-btn admv3-btn-ghost text-red-500" onClick={() => deleteMany(Array.from(selected))}>
            <Trash2 size={14} /> Xoá đã chọn ({selected.size})
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin inline mr-2" /> Đang tải…</div>
      ) : visible.length === 0 ? (
        <div className="admv3-card p-6 text-center text-sm text-muted-foreground">
          <ImagePlus size={22} className="inline mr-2 opacity-60" /> Chưa có {tab.toUpperCase()} nào.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {visible.map((row) => (
            <div key={row.id} className={`admv3-card p-2 space-y-2 ${selected.has(row.id) ? "!border-primary" : ""}`}>
              <div className="relative">
                <MediaItem url={row.url} alt={row.label} className="w-full h-40 object-contain bg-black/5 rounded" />
                <label className="absolute top-1 left-1 bg-background/80 rounded p-1">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </label>
              </div>
              <input className="admv3-input" value={row.label}
                onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, label: e.target.value } : r))} />
              <div className="flex items-center gap-1">
                <select className="admv3-input flex-1" value={row.kind}
                  onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, kind: e.target.value as GifKind } : r))}>
                  {MEDIA_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <button className="admv3-btn admv3-btn-ghost" title="Lên" onClick={() => move(row, -1)}><ArrowUp size={12} /></button>
                <button className="admv3-btn admv3-btn-ghost" title="Xuống" onClick={() => move(row, 1)}><ArrowDown size={12} /></button>
              </div>
              <div className="flex items-center gap-1">
                <button className="admv3-btn flex-1" onClick={() => saveRow(row)}><Save size={12} /> Lưu</button>
                <button className="admv3-btn admv3-btn-ghost text-red-500" onClick={() => deleteMany([row.id])}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {linkOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => (linkSaving ? null : setLinkOpen(false))}
        >
          <div className="admv3-card w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2"><Link2 size={16} /> Upload Link</div>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setLinkOpen(false)} disabled={linkSaving}><X size={14} /></button>
            </div>
            <input className="admv3-input w-full" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <input className="admv3-input w-full" placeholder="Tên hiển thị (tuỳ chọn)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
            <select className="admv3-input w-full" value={linkKind} onChange={(e) => setLinkKind(e.target.value as GifKind)}>
              {MEDIA_KINDS.map((k) => <option key={k.key} value={k.key}>Loại: {k.label}</option>)}
            </select>
            <button className="admv3-btn w-full" onClick={() => void saveLink()} disabled={linkSaving}>
              {linkSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MediaLibraryManager;
