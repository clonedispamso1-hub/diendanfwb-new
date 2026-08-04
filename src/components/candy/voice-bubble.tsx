/**
 * Voice Bubble — player kiểu Messenger, dùng Signed URL (hết hạn 10 phút).
 * Chặn menu chuột phải + không cho tải xuống.
 */
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, Mic } from "lucide-react";
import { formatVoiceDuration, getVoiceSignedUrl } from "@/lib/voice-chat";

const BARS = 28;

export function VoiceBubble({
  path,
  duration,
  isSelf,
}: {
  path: string;
  duration: number;
  isSelf?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggle = async () => {
    if (error) return;
    const el = audioRef.current;
    if (playing && el) { el.pause(); setPlaying(false); return; }
    setLoading(true);
    try {
      const url = await getVoiceSignedUrl(path);
      if (!url) { setError(true); return; }
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = "none";
        audio.controls = false;
        // Chặn tải xuống / hiện URL gốc trên mọi trình duyệt hỗ trợ.
        audio.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
        audio.disableRemotePlayback = true;
        audio.onended = () => { setPlaying(false); setProgress(0); };
        audio.ontimeupdate = () => {
          const d = audio!.duration || duration || 1;
          setProgress(Math.min(1, (audio!.currentTime || 0) / d));
        };
        audio.onerror = () => { setError(true); setPlaying(false); };
        audioRef.current = audio;
      }
      if (audio.src !== url) audio.src = url;
      await audio.play();
      setPlaying(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`voice-bubble${isSelf ? " is-self" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <button type="button" className="voice-bubble-play" onClick={() => void toggle()} aria-label={playing ? "Tạm dừng" : "Phát"}>
        {loading ? <Loader2 size={16} className="voice-spin" /> : playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div
        className="voice-bubble-wave"
        role="slider"
        aria-label="Tua tin nhắn thoại"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onClick={(e) => {
          const audio = audioRef.current;
          if (!audio) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
          if (total > 0) { audio.currentTime = ratio * total; setProgress(ratio); }
        }}
      >
        {Array.from({ length: BARS }).map((_, i) => (
          <span
            key={i}
            className={`voice-bar${i / BARS <= progress ? " is-played" : ""}${playing ? " is-live" : ""}`}
            style={{ height: `${6 + ((i * 7) % 16)}px`, animationDelay: `${(i % 8) * 0.08}s` }}
          />
        ))}
      </div>
      <span className="voice-bubble-time">
        {error ? "Lỗi" : formatVoiceDuration(duration)}
      </span>
      <Mic size={12} className="voice-bubble-mic" aria-hidden />
    </div>
  );
}

export default VoiceBubble;