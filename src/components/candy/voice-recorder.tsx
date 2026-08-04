/**
 * Voice Recorder — ghi âm tối đa 60s.
 *
 * Luồng: Ghi âm → Dừng → Nghe lại (player waveform) → Huỷ hoặc Gửi.
 * KHÔNG kiểm tra VIP ở đây; việc kiểm tra quyền diễn ra ở bước Gửi
 * (component cha) để không upload gì khi người dùng không đủ quyền.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2, Send, Square, Loader2, Play, Pause, Mic } from "lucide-react";
import { toast } from "sonner";
import { VOICE_MAX_SECONDS, formatVoiceDuration } from "@/lib/voice-chat";

const PREVIEW_BARS = 26;

export function VoiceRecorder({
  onCancel,
  onSend,
  sending,
  compact,
}: {
  onCancel: () => void;
  onSend: (blob: Blob, duration: number) => void;
  sending?: boolean;
  compact?: boolean;
}) {
  const [seconds, setSeconds] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const secondsRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const disposePreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          blobRef.current = blob;
          cleanup();
          try {
            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            setPreviewUrl(url);
          } catch { /* noop */ }
          setStopped(true);
        };
        rec.start();
      } catch {
        if (!alive) return;
        // KHÔNG render lỗi trong composer (vỡ layout mobile) — dùng toast.
        setError("mic");
        toast.error("Không truy cập được micro", {
          description: "Hãy cho phép quyền ghi âm trong trình duyệt rồi thử lại.",
        });
        cancelRef.current?.();
      }
    })();
    return () => {
      alive = false;
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      cleanup();
      disposePreview();
    };
  }, []);

  useEffect(() => {
    if (stopped || error) return;
    const id = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= VOICE_MAX_SECONDS) {
        try { recorderRef.current?.stop(); } catch { /* noop */ }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [stopped, error]);

  const stop = () => { try { recorderRef.current?.stop(); } catch { /* noop */ } };

  const cancelAll = () => {
    stop();
    cleanup();
    disposePreview();
    blobRef.current = null;
    onCancel();
  };

  const togglePreview = () => {
    if (!previewUrl) return;
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(previewUrl);
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.ontimeupdate = () => {
        const d = Number.isFinite(audio!.duration) && audio!.duration > 0
          ? audio!.duration
          : secondsRef.current || 1;
        setProgress(Math.min(1, (audio!.currentTime || 0) / d));
      };
      audioRef.current = audio;
    }
    if (playing) { audio.pause(); setPlaying(false); return; }
    void audio.play().then(() => setPlaying(true)).catch(() => undefined);
  };

  return (
    <div
      className={`voice-recorder${compact ? " is-compact" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className="voice-rec-cancel" onClick={cancelAll} aria-label="Huỷ ghi âm">
        <Trash2 size={18} />
      </button>

      {stopped ? (
        <div className="voice-rec-body">
          <button
            type="button"
            className="voice-rec-preview-play"
            onClick={togglePreview}
            aria-label={playing ? "Tạm dừng nghe lại" : "Nghe lại"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="voice-rec-wave is-preview" aria-hidden>
            {Array.from({ length: PREVIEW_BARS }).map((_, i) => (
              <span
                key={i}
                className={`${i / PREVIEW_BARS <= progress ? "is-played" : ""}${playing ? " is-live" : ""}`}
                style={{ height: `${7 + ((i * 5) % 15)}px`, animationDelay: `${(i % 8) * 0.07}s` }}
              />
            ))}
          </div>
          <span className="voice-rec-time">{formatVoiceDuration(secondsRef.current)}</span>
        </div>
      ) : (
        <div className="voice-rec-body">
          <span className="voice-rec-dot" aria-hidden />
          <Mic size={14} className="voice-rec-mic" aria-hidden />
          <div className="voice-rec-wave" aria-hidden>
            {Array.from({ length: 22 }).map((_, i) => (
              <span key={i} className="is-live" style={{ animationDelay: `${(i % 7) * 0.07}s` }} />
            ))}
          </div>
          <span className="voice-rec-time">
            {formatVoiceDuration(seconds)} / {formatVoiceDuration(VOICE_MAX_SECONDS)}
          </span>
        </div>
      )}

      {!stopped && !error ? (
        <button type="button" className="voice-rec-stop" onClick={stop} aria-label="Dừng ghi âm">
          <Square size={16} />
        </button>
      ) : (
        <button
          type="button"
          className="voice-rec-send"
          disabled={!!error || sending || !blobRef.current}
          onClick={() => blobRef.current && onSend(blobRef.current, secondsRef.current)}
          aria-label="Gửi voice"
        >
          {sending ? <Loader2 size={16} className="voice-spin" /> : <Send size={16} />}
        </button>
      )}
    </div>
  );
}

export default VoiceRecorder;
