/** Nút "Sao chép" và "QR" trên thanh công cụ chat của Tài khoản thứ hai. */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Pencil, Plus, QrCode, Trash2, Upload, X } from "lucide-react";
import { adminSetSiteSetting, getSiteSetting } from "@/lib/admin-db";
import { copyTextLines, copyTextToken, DEFAULT_QR_NOTES, qrPayToken, type CopyTextLine } from "@/lib/chat-cards";
import { r2Provider } from "@/lib/media/providers";
import { prepareQrImage } from "@/lib/qr-image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyTextBubble } from "@/components/candy/chat-card-bubbles";

export const COPY_TEMPLATES_KEY = "chat_copy_templates";
type Tpl = { id: string; text: string; lines?: CopyTextLine[]; title?: string };
type DraftRow = CopyTextLine & { id: string };
const emptyRow = (): DraftRow => ({ id: uid(), label: "", text: "", kind: "field", copyEnabled: true });
const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[95] bg-black/50 grid place-items-center p-3" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-auto rounded-xl border bg-card text-card-foreground shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">{title}</div>
          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="p-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function CopyTextToolButton({ onSend, disabled }: { onSend: (content: string) => Promise<boolean | void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Tpl[]>([]);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const lines: CopyTextLine[] = rows.filter((row) => row.text.trim() || row.label?.trim()).map(({ id: _id, ...line }) => line);
  const text = lines.map((line) => `${line.label?.trim() ? `${line.label.replace(/[:：]\s*$/, "")}: ` : ""}${line.text}`).join("\n");
  const valid = lines.length > 0 && lines.every((line) => line.text.trim());
  function updateRow(id: string, patch: Partial<CopyTextLine>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function reset() { setTitle(""); setRows([emptyRow()]); setEditing(null); }
  function selectTemplate(t: Tpl) {
    setTitle(t.title || "");
    setRows(copyTextLines(t).map((line) => ({ ...line, id: uid(), label: line.label || "", kind: line.kind || "field" })));
  }
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getSiteSetting<Tpl[]>(COPY_TEMPLATES_KEY, true).then((v) => setList(Array.isArray(v) ? v.filter((t) => t && typeof t.text === "string") : [])).catch(() => {});
  }, [open]);

  async function persist(next: Tpl[]) {
    setBusy(true);
    try { await adminSetSiteSetting(COPY_TEMPLATES_KEY, next); setList(next); return true; }
    catch (e: any) { toast.error(e?.message || "Không lưu được mẫu"); return false; }
    finally { setBusy(false); }
  }
  async function saveTemplate() {
    if (!valid) return;
    const next = editing ? list.map((t) => (t.id === editing ? { ...t, title, text, lines } : t)) : [...list, { id: uid(), title, text, lines }];
    if (await persist(next)) { toast.success(editing ? "Đã cập nhật mẫu" : "Đã lưu mẫu"); setEditing(null); }
  }
  async function send() {
    if (!valid) return;
    setBusy(true);
    try { const ok = await onSend(copyTextToken(text, lines, title)); if (ok !== false) { setOpen(false); reset(); } }
    catch { /* toast ở sendRaw */ }
    finally { setBusy(false); }
  }

  return (
    <>
      <Button type="button" className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Sao chép (tin nhắn có nút sao chép)"
        disabled={disabled} onClick={() => setOpen(true)}><Copy size={16} /></Button>
      {open && (
        <Shell title="Tin nhắn Sao chép" onClose={() => setOpen(false)}>
          <label className="block text-xs text-muted-foreground">Tiêu đề card
            <input className="admv3-input w-full mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thông tin thanh toán" />
          </label>
          <div className="copy-builder-rows">
            {rows.map((row, i) => (
              <div key={row.id} className="copy-builder-row">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">Dòng {i + 1}
                    <select className="admv3-input" aria-label={`Loại dòng ${i + 1}`} value={row.kind}
                      onChange={(e) => updateRow(row.id, { kind: e.target.value === "note" ? "note" : "field" })}>
                      <option value="field">Thông tin</option><option value="note">Lưu ý</option>
                    </select>
                  </label>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Xóa dòng ${i + 1}`} title="Xóa dòng" disabled={busy} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 size={15} /></Button>
                </div>
                <label className="block text-xs text-muted-foreground">Label
                  <input className="admv3-input w-full mt-1" aria-label={`Label dòng ${i + 1}`} value={row.label} placeholder={row.kind === "note" ? "Lưu ý" : "STK"}
                    onChange={(e) => updateRow(row.id, { label: e.target.value })} />
                </label>
                <label className="block text-xs text-muted-foreground">Nội dung
                  <textarea className="admv3-input w-full mt-1 min-h-[60px]" aria-label={`Nội dung dòng ${i + 1}`} value={row.text} placeholder={row.kind === "note" ? "Chuyển đúng nội dung" : "103887698556"}
                    onChange={(e) => updateRow(row.id, { text: e.target.value })} />
                </label>
                <label className="copy-builder-checkbox">
                  <Checkbox aria-label={`Bật sao chép dòng ${i + 1}`} checked={row.copyEnabled} onCheckedChange={(checked) => updateRow(row.id, { copyEnabled: checked === true })} />
                  Sao chép
                </label>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => setRows((current) => [...current, emptyRow()])}><Plus size={15} /> Thêm dòng</Button>
          {lines.length ? <div className="copy-template-preview"><CopyTextBubble data={{ title, text, lines }} /></div> : null}
          <div className="flex flex-wrap gap-2">
            <Button className="admv3-btn" disabled={busy || !valid} onClick={saveTemplate}>
              <Plus size={14} /> {editing ? "Lưu thay đổi mẫu" : "Lưu thành mẫu"}</Button>
            {editing && <Button className="admv3-btn admv3-btn-ghost" onClick={reset}>Hủy sửa</Button>}
            <Button className="admv3-btn admv3-btn-primary ml-auto" disabled={busy || !valid || disabled} onClick={send}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Gửi</Button>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Mẫu đã lưu ({list.length}) — bấm để chọn, chưa gửi</div>
            {!list.length && <div className="text-xs text-muted-foreground">Chưa có mẫu.</div>}
            <ul className="space-y-1">
              {list.map((t) => (
                <li key={t.id} className="flex items-start gap-1 rounded-md border px-2 py-1">
                  <Button type="button" variant="ghost" size="unstyled" className="flex-1 min-w-0 justify-start text-left text-xs whitespace-pre-wrap break-words" onClick={() => selectTemplate(t)}>{t.title ? `${t.title}\n${t.text}` : t.text}</Button>
                  <Button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Sửa" onClick={() => { setEditing(t.id); selectTemplate(t); }}><Pencil size={13} /></Button>
                  <Button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Xóa" disabled={busy}
                    onClick={() => { if (confirm("Xóa mẫu này?")) void persist(list.filter((x) => x.id !== t.id)); }}><Trash2 size={13} /></Button>
                </li>
              ))}
            </ul>
          </div>
        </Shell>
      )}
    </>
  );
}

export function QrToolButton({ onSend, disabled }: { onSend: (content: string) => Promise<boolean | void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"upload" | "link">("upload");
  const [title, setTitle] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState<string[]>(DEFAULT_QR_NOTES);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() { setSource("upload"); setTitle(""); setQrUrl(""); setLinkDraft(""); setMinutes(""); setNotes(DEFAULT_QR_NOTES); }

  function applyLink() {
    const url = linkDraft.trim();
    if (!/^https:\/\//i.test(url)) { toast.error("Link QR phải bắt đầu bằng https://"); return; }
    setQrUrl(url);
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const prepared = await prepareQrImage(file);
      // Mỗi QR một file riêng với tên ngẫu nhiên → không ghi đè, không đoán được URL.
      const res = await r2Provider.upload(prepared, `qr-${uid()}.png`, { kind: "other", folder: "payment-qr", compress: false } as any);
      setQrUrl(res.secureUrl);
    } catch (e: any) { toast.error(e?.message || "Tải QR lên thất bại"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function send() {
    if (!qrUrl) return;
    const m = Number(minutes.replace(",", "."));
    setBusy(true);
    try {
      const ok = await onSend(qrPayToken({ qrUrl, minutes: Number.isFinite(m) && m > 0 ? Math.min(m, 1440) : 0, notes, title: title.trim() }));
      if (ok !== false) { setOpen(false); reset(); }
    } catch { /* toast ở sendRaw */ }
    finally { setBusy(false); }
  }

  const mm = Number(minutes.replace(",", "."));
  return (
    <>
      <button type="button" className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Gửi mã QR"
        disabled={disabled} onClick={() => setOpen(true)}><QrCode size={16} /></button>
      {open && (
        <Shell title="Tin nhắn QR" onClose={() => setOpen(false)}>
          <label className="block text-xs text-muted-foreground">Tiêu đề QR — hiển thị phía trên ảnh (VD: ADMIN HÀ NỘI BANK)
            <input className="admv3-input w-full mt-1" value={title} maxLength={80} placeholder="ADMIN HÀ NỘI BANK"
              onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid place-items-center rounded-lg border border-dashed p-2 min-h-[140px]">
            {qrUrl ? <img src={qrUrl} alt="QR" className="max-h-48 rounded" /> : <span className="text-xs text-muted-foreground">Chưa có ảnh QR</span>}
          </div>
          <div className="flex items-center gap-3 text-xs font-medium" role="radiogroup" aria-label="Nguồn ảnh QR">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="qr-source" checked={source === "upload"} onChange={() => setSource("upload")} /> Upload ảnh QR
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="qr-source" checked={source === "link"} onChange={() => setSource("link")} /> Link QR
            </label>
          </div>
          {source === "upload" ? (
            <>
              <button className="admv3-btn w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {qrUrl ? "Đổi ảnh QR" : "Tải ảnh QR lên"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </>
          ) : (
            <label className="block text-xs text-muted-foreground">Link ảnh QR (https://…) — hiển thị trực tiếp, không upload
              <div className="flex gap-1 mt-1">
                <input className="admv3-input flex-1" inputMode="url" value={linkDraft} placeholder="https://…/qr.png"
                  onChange={(e) => setLinkDraft(e.target.value)} />
                <button type="button" className="admv3-btn" disabled={!linkDraft.trim()} onClick={applyLink}>Dùng link</button>
              </div>
            </label>
          )}
          <label className="block text-xs text-muted-foreground">Thời gian đếm ngược (phút) — bỏ trống = không đếm ngược
            <input className="admv3-input w-full mt-1" inputMode="decimal" value={minutes} placeholder="VD: 5"
              onChange={(e) => setMinutes(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
          {mm > 0 && <div className="text-xs">Hiển thị: <b className="font-mono">{String(Math.floor(mm)).padStart(2, "0")}:{String(Math.round((mm % 1) * 60)).padStart(2, "0")}</b> → 00:00</div>}
          {notes.map((n, i) => (
            <label key={i} className="block text-xs text-muted-foreground">Lưu ý {i + 1} — bỏ trống = không hiển thị
              <textarea className="admv3-input w-full mt-1 min-h-[48px]" value={n} maxLength={300}
                onChange={(e) => setNotes((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
          <button className="admv3-btn admv3-btn-primary w-full" disabled={!qrUrl || busy || uploading || disabled} onClick={send}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Gửi QR</button>
        </Shell>
      )}
    </>
  );
}
