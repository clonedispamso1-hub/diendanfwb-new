/**
 * Voice Library Picker — thư viện voice DÙNG CHUNG cho Chat / Đăng bài / Bình luận.
 * Hỗ trợ: nghe thử, chọn để gửi, upload mới (mp3/wav/m4a/webm), đổi tên, xoá.
 */
import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, Loader2, Upload, Pencil, Trash2, Check, Plus, Folder, ChevronLeft } from "lucide-react";
import { createPortal } from "react-dom";
import {
  listVoiceLibrary,
  getVoiceSignedUrl,
  formatVoiceDuration,
  uploadVoiceLibraryItem,
  deleteVoiceLibraryItem,
  renameVoiceLibraryItem,
  readAudioDuration,
  type VoiceLibraryItem,
} from "@/lib/voice-chat";
import { supabase } from "@/lib/supabase";

const FOLDERS_KEY = "voice-lib-folders";

export function VoiceLibraryPicker({
  open,
  onClose,
  onPick,
  manage = true,
  title = "Thư viện voice",
  storage = "default",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: VoiceLibraryItem) => void;
  /** Cho phép upload / đổi tên / xoá (dùng ở Admin). */
  manage?: boolean;
  title?: string;
  /** "sb2-compressed": nén cực mạnh + lưu Supabase #2 (Tài khoản thứ hai). */
  storage?: "default" | "sb2-compressed";
}) {
  const [items, setItems] = useState<VoiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]"); } catch { return []; }
  });
  const [audio] = useState(() => (typeof Audio !== "undefined" ? new Audio() : null));

  const load = () => {
    setLoading(true);
    setErr(null);
    listVoiceLibrary()
      .then(setItems)
      .catch((e) => setErr(e?.message || "Không tải được thư viện voice"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  useEffect(() => () => { audio?.pause(); }, [audio]);

  if (!open || typeof document === "undefined") return null;

  const folders = Array.from(
    new Set([...extraFolders, ...items.map((i) => i.category?.trim()).filter((c): c is string => !!c)]),
  ).sort((a, b) => a.localeCompare(b));
  const visible = folder === null
    ? items.filter((i) => !i.category?.trim())
    : items.filter((i) => i.category?.trim() === folder);

  const addFolder = () => {
    const name = window.prompt("Tên thư mục mới:")?.trim();
    if (!name) return;
    const next = Array.from(new Set([...extraFolders, name]));
    setExtraFolders(next);
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setFolder(name);
  };

  const preview = async (item: VoiceLibraryItem) => {
    if (!audio) return;
    if (previewing === item.id) { audio.pause(); setPreviewing(null); return; }
    const url = await getVoiceSignedUrl(item.storage_path);
    if (!url) return;
    audio.src = url;
    audio.onended = () => setPreviewing(null);
    await audio.play().catch(() => undefined);
    setPreviewing(item.id);
  };

  const doUpload = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) throw new Error("Cần đăng nhập");
      const name = window.prompt("Đặt tên cho voice:", file.name.replace(/\.[^.]+$/, ""));
      if (name === null) return;
      const duration = await readAudioDuration(file);
      await uploadVoiceLibraryItem(uid, file, name, duration, folder ?? undefined, storage);
      load();
    } catch (e: any) {
      setErr(e?.message || "Upload thất bại");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doRename = async (item: VoiceLibraryItem) => {
    const next = editValue.trim();
    setEditing(null);
    if (!next || next === item.title) return;
    try {
      await renameVoiceLibraryItem(item.id, next);
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, title: next } : i)));
    } catch (e: any) {
      setErr(e?.message || "Đổi tên thất bại");
    }
  };

  const doDelete = async (item: VoiceLibraryItem) => {
    if (!window.confirm(`Xoá voice "${item.title}"?`)) return;
    try {
      await deleteVoiceLibraryItem(item);
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e: any) {
      setErr(e?.message || "Xoá thất bại");
    }
  };

  return createPortal(
    <div className="voice-lib-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="voice-lib-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="voice-lib-head">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {folder !== null ? (
              <button type="button" onClick={() => setFolder(null)} aria-label="Quay lại"><ChevronLeft size={16} /></button>
            ) : null}
            {folder !== null ? `📁 ${folder}` : title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {manage && folder === null ? (
              <button type="button" className="voice-lib-send" onClick={addFolder} aria-label="Tạo thư mục">
                <Plus size={12} /> Thư mục
              </button>
            ) : null}
            {manage ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.oga,.opus,.aac,.flac,.webm,.weba"
                  hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); }}
                />
                <button type="button" className="voice-lib-send" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={12} className="voice-spin" /> : <Upload size={12} />} Upload
                </button>
              </>
            ) : null}
            <button type="button" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
          </div>
        </div>
        <div className="voice-lib-body">
          {loading ? <div className="voice-lib-empty"><Loader2 size={16} className="voice-spin" /> Đang tải…</div> : null}
          {err ? <div className="voice-lib-empty">{err}</div> : null}
          {!loading && !err && folder === null
            ? folders.map((f) => (
                <button key={`f-${f}`} type="button" className="voice-lib-row" style={{ width: "100%", textAlign: "left" }} onClick={() => setFolder(f)}>
                  <span className="voice-lib-play"><Folder size={14} /></span>
                  <div className="voice-lib-meta">
                    <span className="voice-lib-title">{f}</span>
                    <span className="voice-lib-sub">{items.filter((i) => i.category?.trim() === f).length} voice</span>
                  </div>
                </button>
              ))
            : null}
          {!loading && !err && visible.length === 0 && (folder !== null || folders.length === 0) ? (
            <div className="voice-lib-empty">{folder !== null ? "Thư mục trống. Bấm Upload để thêm voice." : "Thư viện chưa có voice nào."}</div>
          ) : null}
          {visible.map((item) => (
            <div key={item.id} className="voice-lib-row">
              <button type="button" className="voice-lib-play" onClick={() => void preview(item)} aria-label="Nghe thử">
                {previewing === item.id ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="voice-lib-meta">
                {editing === item.id ? (
                  <input
                    className="voice-lib-rename"
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void doRename(item); if (e.key === "Escape") setEditing(null); }}
                  />
                ) : (
                  <span className="voice-lib-title">{item.title}</span>
                )}
                <span className="voice-lib-sub">
                  {formatVoiceDuration(item.duration)}{item.category ? ` • ${item.category}` : ""}
                </span>
              </div>
              {manage ? (
                <>
                  {editing === item.id ? (
                    <button type="button" className="voice-lib-play" onClick={() => void doRename(item)} aria-label="Lưu tên">
                      <Check size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="voice-lib-play"
                      onClick={() => { setEditing(item.id); setEditValue(item.title); }}
                      aria-label="Đổi tên"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button type="button" className="voice-lib-play voice-lib-danger" onClick={() => void doDelete(item)} aria-label="Xoá">
                    <Trash2 size={13} />
                  </button>
                </>
              ) : null}
              <button type="button" className="voice-lib-send" onClick={() => { audio?.pause(); setPreviewing(null); onPick(item); }}>
                Chọn
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VoiceLibraryPicker;
