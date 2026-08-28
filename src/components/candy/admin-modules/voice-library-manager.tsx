/**
 * Voice Library Manager — Admin upload / xoá voice dùng cho nick clone.
 */
import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Play, Pause, Loader2, Mic } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import {
  listVoiceLibrary,
  uploadVoiceLibraryItem,
  deleteVoiceLibraryItem,
  readAudioDuration,
  getVoiceSignedUrl,
  formatVoiceDuration,
  type VoiceLibraryItem,
} from "@/lib/voice-chat";

const ACCEPT = "audio/*,.mp3,.wav,.m4a,.ogg,.oga,.opus,.aac,.flac,.webm,.weba";

export function VoiceLibraryManager() {
  const { me } = useAuth();
  const [items, setItems] = useState<VoiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reload = () => {
    setLoading(true);
    listVoiceLibrary()
      .then(setItems)
      .catch((e) => setMsg(e?.message || "Không tải được thư viện"))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const onFile = async (file?: File | null) => {
    if (!file || !me?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      const dur = await readAudioDuration(file);
      await uploadVoiceLibraryItem(me.id, file, title || file.name, dur, category);
      setTitle("");
      setCategory("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
      setMsg("Đã tải lên thành công.");
    } catch (e: any) {
      setMsg(e?.message || "Tải lên thất bại");
    } finally {
      setBusy(false);
    }
  };

  const preview = async (item: VoiceLibraryItem) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (previewing === item.id) { audio.pause(); setPreviewing(null); return; }
    const url = await getVoiceSignedUrl(item.storage_path);
    if (!url) return;
    audio.src = url;
    audio.onended = () => setPreviewing(null);
    await audio.play().catch(() => undefined);
    setPreviewing(item.id);
  };

  const remove = async (item: VoiceLibraryItem) => {
    if (!confirm(`Xoá voice "${item.title}"?`)) return;
    try {
      await deleteVoiceLibraryItem(item);
      setItems((cur) => cur.filter((i) => i.id !== item.id));
    } catch (e: any) {
      setMsg(e?.message || "Xoá thất bại");
    }
  };

  return (
    <div className="adm-panel" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
        <Mic size={16} /> Thư viện Voice (Admin)
      </div>

      <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "rgba(148,163,184,0.10)" }}>
        <input
          className="app-input"
          placeholder="Tên voice (tuỳ chọn)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="app-input"
          placeholder="Nhóm / chủ đề (tuỳ chọn)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => void onFile(e.target.files?.[0])} hidden />
        <button
          type="button"
          className="adm-btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}
        >
          {busy ? <Loader2 size={15} className="voice-spin" /> : <Upload size={15} />}
          Tải lên voice (mp3, wav, m4a, webm)
        </button>
        {msg ? <div style={{ fontSize: 12, opacity: 0.8 }}>{msg}</div> : null}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {loading ? <div style={{ fontSize: 13, opacity: 0.7 }}>Đang tải…</div> : null}
        {!loading && items.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>Chưa có voice nào trong thư viện.</div>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="voice-lib-row">
            <button type="button" className="voice-lib-play" onClick={() => void preview(item)} aria-label="Nghe thử">
              {previewing === item.id ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <div className="voice-lib-meta">
              <span className="voice-lib-title">{item.title}</span>
              <span className="voice-lib-sub">
                {formatVoiceDuration(item.duration)}{item.category ? ` • ${item.category}` : ""}
              </span>
            </div>
            <button
              type="button"
              className="voice-lib-play"
              style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
              onClick={() => void remove(item)}
              aria-label="Xoá voice"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VoiceLibraryManager;