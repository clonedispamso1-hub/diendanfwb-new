/**
 * Nén voice CỰC MẠNH cho "Tài khoản thứ hai → Đăng bài".
 *
 * Quy trình (chạy hoàn toàn trong trình duyệt, không gọi server/R2):
 *   1. Giải mã file audio gốc.
 *   2. Trộn về MONO, hạ tần số lấy mẫu còn 16 kHz (đủ rõ cho giọng nói).
 *   3. Mã hoá lại bằng Opus ~16 kbps (MediaRecorder) — nhỏ hơn bản gốc rất nhiều.
 *   4. Nếu trình duyệt không hỗ trợ Opus → xuất WAV 16 kHz mono 16-bit.
 *
 * Nếu bất kỳ bước nào lỗi, trả về file gốc để không chặn luồng đăng bài.
 */

const TARGET_SAMPLE_RATE = 16000;
const TARGET_BITRATE = 16000; // bit/s

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (window.AudioContext ?? (window as any).webkitAudioContext ?? null) as AudioCtor | null;
}

function pickOpusMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

/** Phát lại buffer qua MediaRecorder để mã hoá Opus bitrate thấp. */
async function encodeOpus(buffer: AudioBuffer, mime: string): Promise<Blob> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error("no-audio-context");
  const ctx = new Ctor({ sampleRate: buffer.sampleRate });
  try {
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: TARGET_BITRATE });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    rec.start();
    src.start();
    await new Promise<void>((resolve) => { src.onended = () => resolve(); });
    rec.stop();
    await done;
    return new Blob(chunks, { type: mime.split(";")[0] });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * Nén mạnh 1 file voice. Trả về File mới (hoặc file gốc nếu không nén được).
 */
export async function compressVoiceStrong(file: File | Blob, baseName = "voice"): Promise<File> {
  const original =
    file instanceof File ? file : new File([file], `${baseName}.webm`, { type: file.type || "audio/webm" });
  const Ctor = getAudioContextCtor();
  if (!Ctor || typeof OfflineAudioContext === "undefined") return original;

  try {
    const raw = await original.arrayBuffer();
    const decodeCtx = new Ctor();
    const decoded = await decodeCtx.decodeAudioData(raw.slice(0));
    await decodeCtx.close().catch(() => undefined);

    const frames = Math.max(1, Math.ceil((decoded.duration * TARGET_SAMPLE_RATE)));
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
    const node = offline.createBufferSource();
    node.buffer = decoded;
    node.connect(offline.destination);
    node.start();
    const mono = await offline.startRendering();

    const mime = pickOpusMime();
    let out: Blob;
    let ext: string;
    if (mime) {
      out = await encodeOpus(mono, mime);
      ext = mime.includes("ogg") ? "ogg" : "webm";
    } else {
      out = encodeWav(mono);
      ext = "wav";
    }
    if (!out.size || out.size >= original.size) return original;
    const name = (original.name || baseName).replace(/\.[^./\\]+$/, "");
    return new File([out], `${name}.${ext}`, { type: out.type || "audio/webm" });
  } catch (err) {
    console.warn("[voice-compress] không nén được, dùng file gốc", err);
    return original;
  }
}
