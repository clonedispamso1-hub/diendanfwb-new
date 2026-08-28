/**
 * notify-sound — âm thanh ngắn khi có thông báo mới (bình luận / tặng quà).
 *
 * Dùng WebAudio (không tải file mp3 → 0 egress, 0 delay). Trình duyệt chỉ cho
 * phát sau khi user đã tương tác — ta bỏ qua lỗi im lặng nếu chưa.
 */
let ctx: AudioContext | null = null;
let lastAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Ting ngắn ~0.25s. Chống spam: tối đa 1 lần / 1.2 giây. */
export function playNotifySound() {
  const now = Date.now();
  if (now - lastAt < 1200) return;
  lastAt = now;
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    gain.connect(ac.destination);

    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.3);
  } catch {
    /* im lặng — chưa có tương tác người dùng */
  }
}

/** Phát event để chuông rung/nảy số ngay lập tức. */
export function emitNotifyBump() {
  try {
    window.dispatchEvent(new CustomEvent("app:notif-bump"));
  } catch {
    /* SSR */
  }
}
