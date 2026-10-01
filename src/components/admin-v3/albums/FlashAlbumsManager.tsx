/**
 * ⚡ ALBUM HOT — Admin Panel. 1 Album = 1 Code (tự sinh) = nhiều ảnh + nhiều video.
 * Dữ liệu: Supabase #4, bảng flash_albums / flash_album_media, bucket `flash-albums`.
 * Mọi thao tác ghi đi qua server function có kiểm tra Admin.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Film, ImagePlus, Link2, Pencil, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HotContentManager } from "./HotContentManager";
import { adminDb } from "@/lib/admin-db";
import { fetchFlashZalo, saveFlashZalo } from "@/lib/flash-album-zalo";
import { sb4 } from "@/lib/supabase-v4";
import {
  flashAddMediaFn,
  flashCreateFn,
  flashDeleteFn,
  flashDeleteMediaFn,
  flashListFn,
  flashPurgeAllFn,
  flashRenameFn,
  flashSignUploadsFn,
  type FlashAlbum,
} from "@/lib/flash-albums.functions";

const BUCKET = "flash-albums";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
type Kind = "image" | "video";
type Draft = { key: string; kind: Kind; url?: string; file?: File; preview: string };
type NewItem = { kind: Kind; url?: string; path?: string; size?: number };

async function token(): Promise<string> {
  const db = await adminDb();
  const { data } = await db.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Phiên Admin đã hết hạn. Vui lòng đăng nhập lại.");
  return t;
}

const isHttpUrl = (u: string) => {
  try { const x = new URL(u.trim()); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; }
};

/** Resize cạnh dài ≤ 1920px, nén WebP (fallback JPEG). GIF giữ nguyên. */
async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d", { alpha: false })!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const b =
      (await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.82))) ||
      (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82)));
    if (!b || b.size >= file.size) return file;
    const ext = b.type === "image/webp" ? "webp" : "jpg";
    return new File([b], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: b.type });
  } catch {
    return file;
  }
}

function extOf(f: File) {
  const fromName = f.name.split(".").pop()?.toLowerCase() || "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return (f.type.split("/")[1] || "bin").replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
}

/** Tải file lên bucket, trả về danh sách media theo đúng thứ tự. */
async function uploadFiles(t: string, albumId: string, files: { kind: Kind; file: File }[]): Promise<NewItem[]> {
  if (!files.length) return [];
  const prepared = await Promise.all(files.map(async (f) => ({ kind: f.kind, file: f.kind === "image" ? await compressImage(f.file) : f.file })));
  const signed = await flashSignUploadsFn({ data: { token: t, id: albumId, files: prepared.map((p) => ({ kind: p.kind, ext: extOf(p.file) })) } });
  const out: NewItem[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const { error } = await sb4().storage.from(BUCKET).uploadToSignedUrl(signed[i].path, signed[i].token, prepared[i].file, {
      contentType: prepared[i].file.type, cacheControl: "31536000",
    } as any);
    if (error) throw new Error(`${prepared[i].file.name}: ${error.message}`);
    out.push({ kind: prepared[i].kind, path: signed[i].path, size: prepared[i].file.size });
  }
  return out;
}

function countLabel(media: { kind: Kind }[] | null | undefined) {
  media = Array.isArray(media) ? media : [];
  const img = media.filter((m) => m.kind === "image").length;
  const vid = media.filter((m) => m.kind === "video").length;
  return [img && `${img} ảnh`, vid && `${vid} video`].filter(Boolean).join(" • ") || "Chưa có media";
}

function pickFiles(list: FileList | null, kind: Kind): File[] {
  const files = Array.from(list ?? []).filter((f) => f.type.startsWith(`${kind}/`));
  return files.filter((f) => {
    if (kind === "video" && f.size > MAX_VIDEO_BYTES) { toast.error(`${f.name}: video vượt 100MB, bỏ qua`); return false; }
    if (kind === "image" && f.size > 25 * 1024 * 1024) { toast.error(`${f.name}: ảnh vượt 25MB, bỏ qua`); return false; }
    return true;
  });
}

/** Ô dán URL + nút Thêm + nút tải file, dùng chung cho form tạo và form sửa. */
function MediaAdder({ kind, disabled, onUrl, onFiles }: { kind: Kind; disabled?: boolean; onUrl: (url: string) => void; onFiles: (files: File[]) => void }) {
  const [url, setUrl] = useState("");
  const label = kind === "image" ? "ảnh" : "video";
  const add = () => {
    const u = url.trim();
    if (!isHttpUrl(u)) { toast.error("URL phải bắt đầu bằng http:// hoặc https://"); return; }
    onUrl(u);
    setUrl("");
  };
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          type="url"
          className="flash-create-input min-w-0"
          placeholder={`Dán URL ${label} (https://...)`}
          value={url}
          disabled={disabled}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" disabled={disabled || !url.trim()} onClick={add}><Plus size={15} /> Thêm</Button>
      </div>
      <label className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <Upload size={15} /> Tải {label} lên
        <input
          type="file"
          multiple
          accept={`${kind}/*`}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => { const f = pickFiles(e.target.files, kind); e.target.value = ""; if (f.length) onFiles(f); }}
        />
      </label>
    </div>
  );
}

function MediaThumb({ kind, src, onRemove, disabled }: { kind: Kind; src: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="relative aspect-square min-w-0 overflow-hidden rounded-md border border-border bg-muted">
      {kind === "image" ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <video src={src} muted playsInline preload="metadata" controls controlsList="nodownload" disablePictureInPicture className="h-full w-full object-cover" onContextMenu={(e) => e.preventDefault()} />
      )}
      <button type="button" disabled={disabled} onClick={onRemove} aria-label="Xóa media" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-destructive text-destructive-foreground shadow">
        <X size={14} />
      </button>
    </div>
  );
}

export function FlashAlbumsManager() {
  const [albums, setAlbums] = useState<FlashAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [zaloLink, setZaloLink] = useState("");
  const [zaloDraft, setZaloDraft] = useState("");
  const [zaloBusy, setZaloBusy] = useState(false);
  // Form tạo
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [createErr, setCreateErr] = useState<string | null>(null);
  // Sửa
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      setAlbums(await flashListFn({ data: { token: await token() } }));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được album");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void fetchFlashZalo().then((link) => { setZaloLink(link); setZaloDraft(link); });
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Thao tác thất bại");
    } finally {
      setBusy(null);
    }
  };

  const saveZalo = async () => {
    const link = zaloDraft.trim();
    if (link && !isHttpUrl(link)) { toast.error("Link Zalo không hợp lệ"); return; }
    setZaloBusy(true);
    try {
      const saved = await saveFlashZalo(link);
      setZaloLink(saved); setZaloDraft(saved);
      toast.success(saved ? "Đã lưu link nhóm Zalo" : "Đã xóa link nhóm Zalo");
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được link Zalo");
    } finally {
      setZaloBusy(false);
    }
  };

  const addDraftUrl = (kind: Kind, url: string) =>
    setDrafts((d) => [...d, { key: crypto.randomUUID(), kind, url, preview: url }]);
  const addDraftFiles = (kind: Kind, files: File[]) =>
    setDrafts((d) => [...d, ...files.map((file) => ({ key: crypto.randomUUID(), kind, file, preview: URL.createObjectURL(file) }))]);
  const removeDraft = (key: string) =>
    setDrafts((d) => {
      const x = d.find((i) => i.key === key);
      if (x?.file) URL.revokeObjectURL(x.preview);
      return d.filter((i) => i.key !== key);
    });

  const closeCreate = () => {
    if (busy === "create") return;
    drafts.forEach((d) => d.file && URL.revokeObjectURL(d.preview));
    setDrafts([]); setNewName(""); setCreateErr(null); setCreateOpen(false);
  };

  const create = async () => {
    const title = newName.trim();
    if (!title) { setCreateErr("Vui lòng nhập tiêu đề album."); return; }
    setBusy("create");
    setCreateErr(null);
    try {
      const t = await token();
      const { id, code } = await flashCreateFn({ data: { token: t, name: title } });
      // Thứ tự hiển thị: ảnh trước, video sau, theo đúng thứ tự admin đã thêm.
      const ordered = [...drafts.filter((d) => d.kind === "image"), ...drafts.filter((d) => d.kind === "video")];
      const uploaded = await uploadFiles(t, id, ordered.filter((d) => d.file).map((d) => ({ kind: d.kind, file: d.file! })));
      let u = 0;
      const items: NewItem[] = ordered.map((d) => (d.file ? uploaded[u++] : { kind: d.kind, url: d.url }));
      if (items.length) await flashAddMediaFn({ data: { token: t, id, items } });
      toast.success(`Đã tạo Album HOT — Code: ${code}`);
      drafts.forEach((d) => d.file && URL.revokeObjectURL(d.preview));
      setDrafts([]); setNewName(""); setCreateOpen(false);
      await load();
    } catch (e: any) {
      const msg = String(e?.message || "Không tạo được album");
      setCreateErr(msg);
      toast.error(msg);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const purgeAll = () => {
    const v = window.prompt('Xóa TOÀN BỘ Album HOT + ảnh/video (không ảnh hưởng module khác).\nGõ "XOA" để xác nhận:');
    if (v !== "XOA") return;
    void run("purge", async () => {
      const r = await flashPurgeAllFn({ data: { token: await token(), confirm: "XOA" } });
      toast.success(`Đã xóa ${r.albums} album, ${r.files} tệp`);
    });
  };

  const editing = albums.find((a) => a.id === editId) || null;
  const imgDrafts = drafts.filter((d) => d.kind === "image");
  const vidDrafts = drafts.filter((d) => d.kind === "video");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">⚡ ALBUM HOT</h2>
        <div className="flex gap-2">
          <button type="button" className="admv3-btn" onClick={() => setCreateOpen(true)} disabled={!!busy}>
            <Plus size={14} /> Tạo Album HOT
          </button>
          <button type="button" className="admv3-btn" onClick={purgeAll} disabled={!!busy || !albums.length}>
            <Trash2 size={14} /> Xóa tất cả
          </button>
        </div>
      </div>

      <section aria-label="Danh sách Album HOT">
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : !albums.length ? (
          <p className="text-sm text-muted-foreground">Chưa có album nào.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {albums.map((a) => {
              const cover = (a.media ?? []).find((m) => m.id === a.cover_media_id && m.kind === "image") || (a.media ?? []).find((m) => m.kind === "image");
              const firstVideo = (a.media ?? []).find((m) => m.kind === "video");
              return (
                <article key={a.id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-[4/5] bg-muted">
                    {cover ? (
                      <img src={cover.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : firstVideo ? (
                      <video src={`${firstVideo.url}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-3xl">⚡</div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="line-clamp-2 text-sm font-bold">{a.name}</div>
                    <div className="font-mono text-xs font-semibold text-primary">{a.code}</div>
                    <div className="text-xs text-muted-foreground">{countLabel((a.media ?? []))}</div>
                    <div className="text-[11px] text-muted-foreground">👁 {a.view_count} · ❤ {a.like_count}</div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => { setEditId(a.id); setEditName(a.name); }}><Pencil size={14} /> Sửa</Button>
                      <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => { if (window.confirm(`Xóa album ${a.code}?`)) void run("del", async () => flashDeleteFn({ data: { token: await token(), id: a.id } }), "Đã xóa album"); }}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Link2 size={18} className="text-primary" />
          <span>💬 Link nhóm Zalo lấy Code</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="url" className="min-w-0 rounded-md border border-border bg-background px-3 py-2" placeholder="https://zalo.me/g/..." value={zaloDraft} onChange={(e) => setZaloDraft(e.target.value)} />
          <button type="button" className="admv3-btn justify-center" disabled={zaloBusy || zaloDraft.trim() === zaloLink} onClick={() => void saveZalo()}>
            <Save size={14} /> {zaloBusy ? "Đang lưu…" : "Lưu link"}
          </button>
        </div>
      </div>

      <HotContentManager />

      {createOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-2 sm:p-4" onClick={closeCreate}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Tạo Album HOT"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void create(); }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
              <h3 className="text-lg font-bold">Tạo Album HOT</h3>
              <Button type="button" size="icon" variant="ghost" onClick={closeCreate} disabled={busy === "create"} aria-label="Đóng"><X size={18} /></Button>
            </div>
            <div className="space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
              <label className="grid gap-1.5 text-sm font-semibold">Tiêu đề
                <input autoFocus required className="flash-create-input" placeholder="Nhập tiêu đề album" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} />
              </label>

              <section className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-bold"><ImagePlus size={16} /> Ảnh ({imgDrafts.length})</h4>
                <MediaAdder kind="image" disabled={busy === "create"} onUrl={(u) => addDraftUrl("image", u)} onFiles={(f) => addDraftFiles("image", f)} />
                {imgDrafts.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {imgDrafts.map((d) => <MediaThumb key={d.key} kind="image" src={d.preview} disabled={busy === "create"} onRemove={() => removeDraft(d.key)} />)}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-bold"><Film size={16} /> Video ({vidDrafts.length})</h4>
                <MediaAdder kind="video" disabled={busy === "create"} onUrl={(u) => addDraftUrl("video", u)} onFiles={(f) => addDraftFiles("video", f)} />
                {vidDrafts.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {vidDrafts.map((d) => <MediaThumb key={d.key} kind="video" src={d.preview} disabled={busy === "create"} onRemove={() => removeDraft(d.key)} />)}
                  </div>
                )}
              </section>
              <p className="text-xs text-muted-foreground">Code sẽ được hệ thống tự sinh sau khi tạo.</p>
              {createErr && <p className="text-sm font-medium text-destructive">{createErr}</p>}
            </div>
            <div className="border-t border-border px-4 py-3 sm:px-6">
              <Button type="submit" className="w-full" disabled={busy === "create"}>{busy === "create" ? "Đang tạo…" : "TẠO ALBUM HOT"}</Button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-2 sm:p-4" onClick={() => !busy && setEditId(null)}>
          <div role="dialog" aria-modal="true" aria-label="Sửa Album HOT" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold">Sửa album</h3>
                <p className="font-mono text-xs text-primary">{editing.code} · {countLabel((editing.media ?? []))}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setEditId(null)} aria-label="Đóng"><X size={18} /></Button>
            </div>
            <div className="space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input className="flash-create-input min-w-0" value={editName} maxLength={120} onChange={(e) => setEditName(e.target.value)} />
                <Button type="button" disabled={!!busy || !editName.trim() || editName.trim() === editing.name} onClick={() => void run("rename", async () => flashRenameFn({ data: { token: await token(), id: editing.id, name: editName.trim() } }), "Đã sửa tiêu đề")}><Save size={15} /> Lưu</Button>
              </div>
              {(["image", "video"] as const).map((kind) => {
                const list = (editing.media ?? []).filter((m) => m.kind === kind);
                return (
                  <section key={kind} className="space-y-2">
                    <h4 className="text-sm font-bold">{kind === "image" ? "Ảnh" : "Video"} ({list.length})</h4>
                    <MediaAdder
                      kind={kind}
                      disabled={!!busy}
                      onUrl={(url) => void run("add", async () => flashAddMediaFn({ data: { token: await token(), id: editing.id, items: [{ kind, url }] } }), "Đã thêm media")}
                      onFiles={(files) => void run("add", async () => {
                        const t = await token();
                        const items = await uploadFiles(t, editing.id, files.map((file) => ({ kind, file })));
                        await flashAddMediaFn({ data: { token: t, id: editing.id, items } });
                      }, `Đã tải lên ${files.length} tệp`)}
                    />
                    {list.length > 0 && (
                      <div className={`grid gap-2 ${kind === "image" ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"}`}>
                        {list.map((m) => (
                          <MediaThumb key={m.id} kind={kind} src={m.url} disabled={!!busy} onRemove={() => { if (window.confirm("Xóa media này?")) void run("delm", async () => flashDeleteMediaFn({ data: { token: await token(), mediaId: m.id } }), "Đã xóa media"); }} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              <Button type="button" variant="outline" className="w-full text-destructive" disabled={!!busy} onClick={() => { if (window.confirm(`Xóa album ${editing.code}?`)) void run("del", async () => { await flashDeleteFn({ data: { token: await token(), id: editing.id } }); setEditId(null); }, "Đã xóa album"); }}>
                <Trash2 size={15} /> Xóa album
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
