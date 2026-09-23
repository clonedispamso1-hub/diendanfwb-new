/**
 * multiplier-fx — hiệu ứng CASINO cho hệ số nhân.
 *
 *  • flyMultiplierToBadge() — icon "x5" bay theo đường cong (arc) kèm vệt sáng
 *    (trail light) từ ô quà lên Badge "Tổng Nhân" ở đầu màn hình.
 *  • Khi chạm badge: gọi callback để badge bùng sáng + cộng dồn số.
 *
 * CSS thuần (transform + opacity), không thư viện, chạy trên GPU.
 */

type Point = { x: number; y: number };

const STYLE_ID = "multiplier-fx-style";
const LAYER_ID = "multiplier-fx-layer";

const CSS = `
#${LAYER_ID}{position:fixed;inset:0;pointer-events:none;z-index:2147483646;}
.mfx-chip{position:absolute;left:0;top:0;display:grid;place-items:center;
  min-width:44px;height:34px;padding:0 12px;border-radius:999px;
  font-weight:900;font-size:16px;letter-spacing:.3px;color:#4a2c00;
  background:linear-gradient(145deg,#fffbe6 0%,#ffe071 38%,#f5b50a 68%,#b57500 100%);
  box-shadow:0 6px 20px rgba(245,181,10,.55),inset 0 1px 0 rgba(255,255,255,.9);
  text-shadow:0 1px 0 rgba(255,255,255,.7);
  will-change:transform,opacity;transform:translate3d(-50%,-50%,0) scale(.4);opacity:0;}
.mfx-trail{position:absolute;left:0;top:0;width:14px;height:14px;border-radius:999px;
  background:radial-gradient(circle,rgba(255,240,170,.95) 0%,rgba(245,181,10,.55) 45%,rgba(245,181,10,0) 70%);
  will-change:transform,opacity;transform:translate3d(-50%,-50%,0) scale(1);opacity:.9;
  transition:opacity .5s ease,transform .5s ease;}
.mfx-burst{position:absolute;left:0;top:0;width:26px;height:26px;border-radius:999px;
  border:2px solid rgba(255,214,102,.95);
  transform:translate3d(-50%,-50%,0) scale(.4);opacity:.95;
  animation:mfx-burst .55s ease-out forwards;}
@keyframes mfx-burst{to{transform:translate3d(-50%,-50%,0) scale(3.2);opacity:0;}}
.mfx-spark{position:absolute;left:0;top:0;width:7px;height:7px;border-radius:999px;
  background:#ffd966;box-shadow:0 0 10px rgba(255,205,60,.9);
  transform:translate3d(-50%,-50%,0);animation:mfx-spark .6s ease-out forwards;}
@keyframes mfx-spark{to{transform:translate3d(calc(-50% + var(--mfx-dx)),calc(-50% + var(--mfx-dy)),0) scale(.2);opacity:0;}}
@media (prefers-reduced-motion: reduce){
  .mfx-chip,.mfx-trail{transition-duration:.01ms;}
  .mfx-burst,.mfx-spark{animation-duration:.01ms;}
}
`;

function ensureLayer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    document.body.appendChild(layer);
  }
  return layer;
}

/** Vài tia sáng nhỏ toả ra — dùng khi chip va vào badge. */
export function multiplierBurst(at: Point, count = 8) {
  const layer = ensureLayer();
  if (!layer) return;
  const ring = document.createElement("span");
  ring.className = "mfx-burst";
  ring.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
  ring.style.left = `${at.x}px`;
  ring.style.top = `${at.y}px`;
  ring.style.removeProperty("transform");
  layer.appendChild(ring);
  window.setTimeout(() => ring.remove(), 700);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 22 + Math.random() * 26;
    const s = document.createElement("span");
    s.className = "mfx-spark";
    s.style.left = `${at.x}px`;
    s.style.top = `${at.y}px`;
    s.style.setProperty("--mfx-dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--mfx-dy", `${Math.sin(angle) * dist}px`);
    layer.appendChild(s);
    window.setTimeout(() => s.remove(), 750);
  }
}

export interface FlyMultiplierOptions {
  value: number;
  from: Point;
  to: Point;
  /** Thời lượng bay (ms). Mặc định 700. */
  duration?: number;
  /** Gọi khi chip chạm badge. */
  onArrive?: () => void;
}

/**
 * Icon "xN" bay theo đường cong từ ô quà lên Badge Tổng Nhân, để lại vệt sáng.
 * Trả về hàm huỷ (dọn DOM sớm nếu cần).
 */
export function flyMultiplierToBadge(opts: FlyMultiplierOptions): () => void {
  const layer = ensureLayer();
  if (!layer) return () => {};
  const { value, from, to } = opts;
  const duration = opts.duration ?? 700;

  const chip = document.createElement("span");
  chip.className = "mfx-chip";
  chip.textContent = `x${value}`;
  chip.style.transform = `translate3d(${from.x}px, ${from.y}px, 0) translate(-50%,-50%) scale(.4)`;
  layer.appendChild(chip);

  // Đỉnh cung: cao hơn cả điểm đi lẫn điểm đến.
  const peak: Point = {
    x: (from.x + to.x) / 2 + (to.x - from.x) * 0.12,
    y: Math.min(from.y, to.y) - 90,
  };
  const at = (t: number): Point => ({
    x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * peak.x + t * t * to.x,
    y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * peak.y + t * t * to.y,
  });

  const start = performance.now();
  let raf = 0;
  let lastTrail = 0;
  let done = false;

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    // ease-in-out nhẹ cho cảm giác "mượt như casino"
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const p = at(e);
    const scale = 0.4 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1));
    chip.style.opacity = t < 0.06 ? String(t / 0.06) : "1";
    chip.style.transform =
      `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%,-50%) scale(${(0.7 + scale * 0.5).toFixed(3)})`;

    if (now - lastTrail > 26 && t < 0.94) {
      lastTrail = now;
      const dot = document.createElement("span");
      dot.className = "mfx-trail";
      dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%,-50%) scale(1)`;
      layer.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.opacity = "0";
        dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%,-50%) scale(.2)`;
      });
      window.setTimeout(() => dot.remove(), 560);
    }

    if (t < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }
    done = true;
    chip.style.opacity = "0";
    chip.style.transform = `translate3d(${to.x}px, ${to.y}px, 0) translate(-50%,-50%) scale(.2)`;
    window.setTimeout(() => chip.remove(), 220);
    multiplierBurst(to);
    opts.onArrive?.();
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (!done) cancelAnimationFrame(raf);
    chip.remove();
  };
}
