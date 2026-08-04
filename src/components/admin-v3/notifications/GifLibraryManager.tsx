/**
 * Admin — Kho GIF dùng chung (bulk upload / xoá / chỉnh sửa / sắp xếp).
 * Ghi thẳng vào bảng public.gif_library qua Supabase client (RLS: admin only).
 * Không đụng RPC/Feed/Chat.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Upload, Save, ImagePlus, ArrowUp, ArrowDown, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadGifsToStorage } from "@/lib/gif-storage";
import { invalidateSharedLibrary, type GifKind } from "@/lib/gif-pack";

type Row = {
  id: string;
  url: string;
  kind: GifKind;
  label: string;
  keywords: string[] | null;
  sort_order?: number | null;
  created_at?: string;
};

const KINDS: { key: GifKind; label: string }[] = [
  { key: "gif", label: "GIF" },
  { key: "sticker", label: "Sticker" },
  { key: "icon", label: "Icon" },
];

export function GifLibraryManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
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
      const { data, error } = await supabase
        .from("gif_library" as any)
        .select("id, url, kind, label, keywords, sort_order, created_at")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data ?? []) as any);
      invalidateSharedLibrary();
    } catch (e: any) { toast.error(e?.message || "Không tải được kho GIF"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => r.kind === tab && (!term || r.label.toLowerCase().includes(term)));
  }, [rows, tab, q]);

  async function onPickFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    console.info("[gif-library] picked files:", list.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    if (!list.length) return;
    setUploading(true); setProgress(0);
    try {
      // Upload thẳng lên Cloudinary, folder FWB/GIF (dedupe theo SHA-256).
      const { ok, failed } = await uploadGifsToStorage(list, { isAdmin: true }, (p) => setProgress(p));
      if (!ok.length) {
        const reason = failed[0]?.error || "Không rõ nguyên nhân";
        console.error("[gif-library] tất cả file upload thất bại:", failed);
        toast.error(`Upload Cloudinary thất bại: ${reason}`);
        return;
      }
      if (failed.length) {
        toast.warning(`${failed.length} file lỗi: ${failed[0].error}`);
      }
      const payload = ok.map(({ url, file }) => ({
        url,
        kind: defaultKind,
        label: (file.name ?? "gif").replace(/\.[^.]+$/, "").slice(0, 40),
        keywords: [],
      }));
      const { error } = await supabase.from("gif_library" as any).insert(payload as any);
      if (error) {
        console.error("[gif-library] insert gif_library lỗi:", error);
        throw new Error(`Lưu vào gif_library thất bại: ${error.message}`);
      }
      toast.success(`Đã thêm ${ok.length} GIF`);
      await reload();
    } catch (e: any) {
      console.error("[gif-library] upload flow exception:", e);
      toast.error(e?.message || "Upload thất bại");
    }
    finally { setUploading(false); setProgress(0); if (fileRef.current) fileRef.current.value = ""; }
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

  /** Lưu GIF bằng link — KHÔNG upload, chỉ lưu URL vào gif_library. */
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
      const ok = await checkImageUrl(url);
      if (!ok) {
        toast.error("Link không hiển thị được ảnh/GIF. Hãy kiểm tra lại URL.");
        return;
      }
      const fallbackName = decodeURIComponent(parsed.pathname.split("/").pop() || "gif")
        .replace(/\.[^.]+$/, "")
        .slice(0, 40);
      const { error } = await supabase.from("gif_library" as any).insert({
        url,
        kind: linkKind,
        label: (linkName.trim() || fallbackName || "gif").slice(0, 40),
        keywords: [],
      } as any);
      if (error) throw new Error(error.message);
      toast.success("Đã thêm GIF bằng link");
      setLinkOpen(false);
      setLinkUrl(""); setLinkName("");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setLinkSaving(false);
    }
  }


  async function saveRow(row: Row) {
    try {
      const { error } = await supabase.from("gif_library" as any).update({
        label: row.label, kind: row.kind, keywords: row.keywords ?? [], sort_order: row.sort_order ?? 0,
      }).eq("id", row.id);
      if (error) throw error;
      toast.success("Đã lưu");
      invalidateSharedLibrary();
    } catch (e: any) { toast.error(e?.message || "Lưu thất bại"); }
  }

  async function deleteMany(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Xoá ${ids.length} GIF?`)) return;
    try {
      const { error } = await supabase.from("gif_library" as any).delete().in("id", ids);
      if (error) throw error;
      toast.success(`Đã xoá ${ids.length}`);
      setSelected(new Set());
      await reload();
    } catch (e: any) { toast.error(e?.message || "Xoá thất bại"); }
  }

  async function move(row: Row, dir: -1 | 1) {
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold">Kho GIF dùng chung</div>
            <div className="text-xs text-muted-foreground">Upload nhiều file cùng lúc (GIF/PNG/WebP/Sticker). Toàn website dùng chung.</div>
          </div>
          <div className="flex items-center gap-2">
            <select className="admv3-input" value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as GifKind)}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>Loại upload: {k.label}</option>)}
            </select>
            <button className="admv3-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload hàng loạt
            </button>
            <button className="admv3-btn" onClick={() => setLinkOpen(true)}>
              <Link2 size={14} /> Thêm bằng Link
            </button>
            <input ref={fileRef} type="file" hidden multiple accept="image/gif,image/webp,image/png,image/*"
              onChange={(e) => void onPickFiles(e.target.files)} />
          </div>
        </div>
        {uploading ? <div className="text-xs text-muted-foreground">Đang upload… {progress}%</div> : null}
      </div>

      <div className="admv3-card p-3 flex items-center gap-2 flex-wrap">
        {KINDS.map((k) => (
          <button key={k.key} className={`admv3-btn ${tab === k.key ? "" : "admv3-btn-ghost"}`} onClick={() => setTab(k.key)}>
            {k.label} ({rows.filter((r) => r.kind === k.key).length})
          </button>
        ))}
        <input className="admv3-input flex-1 min-w-[200px]" placeholder="Tìm theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <img src={row.url} alt={row.label} loading="lazy" decoding="async" className="w-full h-40 object-contain bg-black/5 rounded" />
                <label className="absolute top-1 left-1 bg-background/80 rounded p-1">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </label>
              </div>
              <input className="admv3-input" value={row.label}
                onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, label: e.target.value } : r))} />
              <div className="flex items-center gap-1">
                <select className="admv3-input flex-1" value={row.kind}
                  onChange={(e) => setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, kind: e.target.value as GifKind } : r))}>
                  {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
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
              <div className="font-semibold flex items-center gap-2"><Link2 size={16} /> Thêm bằng Link</div>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setLinkOpen(false)} disabled={linkSaving}>
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Link GIF *</label>
              <input
                className="admv3-input w-full"
                placeholder="https://abc.com/demo.gif"
                value={linkUrl}
                autoFocus
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tên GIF (không bắt buộc)</label>
              <input
                className="admv3-input w-full"
                placeholder="Tên hiển thị"
                maxLength={40}
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Loại</label>
              <div className="flex items-center gap-3 flex-wrap">
                {KINDS.map((k) => (
                  <label key={k.key} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="gif-link-kind"
                      checked={linkKind === k.key}
                      onChange={() => setLinkKind(k.key)}
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            </div>

            {linkUrl.trim() ? (
              <img
                src={linkUrl.trim()}
                alt="preview"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-40 object-contain bg-black/5 rounded"
              />
            ) : null}

            <div className="flex justify-end gap-2">
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setLinkOpen(false)} disabled={linkSaving}>
                Huỷ
              </button>
              <button className="admv3-btn" onClick={() => void saveLink()} disabled={linkSaving}>
                {linkSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
