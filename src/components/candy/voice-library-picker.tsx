/**
 * Voice Library Picker — thư viện voice DÙNG CHUNG cho Chat / Đăng bài / Bình luận.
 * Hỗ trợ: nghe thử, chọn để gửi, upload mới (mp3/wav/m4a/webm), đổi tên, xoá.
 */
import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, Loader2, Upload, Pencil, Trash2, Check } from "lucide-react";
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

export function VoiceLibraryPicker({
  open,
  onClose,
  onPick,
  manage = true,
  title = "Thư viện voice",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: VoiceLibraryItem) => void;
  /** Cho phép upload / đổi tên / xoá (dùng ở Admin). */
  manage?: boolean;
  title?: string;
}) {
  const [items, setItems] = useState<VoiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
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
      await uploadVoiceLibraryItem(uid, file, name, duration);
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
          <span>{title}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          {!loading && !err && items.length === 0 ? (
            <div className="voice-lib-empty">Thư viện chưa có voice nào.</div>
          ) : null}
          {items.map((item) => (
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
