/**
 * Perf mode helpers — detect low-end devices và đo FPS theo nhu cầu.
 *
 * Quy tắc:
 *  - "low"  : máy yếu (ít core / ít RAM) hoặc user bật prefers-reduced-motion.
 *  - "high" : mặc định.
 *
 * FPS sampler chỉ chạy khi caller chủ động bật (vd: lúc trigger gift tier ≥ premium).
 */

export type PerfMode = "low" | "high";

let cachedBase: PerfMode | null = null;

export function detectBasePerfMode(): PerfMode {
  if (cachedBase) return cachedBase;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    cachedBase = "high";
    return cachedBase;
  }
  try {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cores = (navigator as any).hardwareConcurrency ?? 8;
    const mem = (navigator as any).deviceMemory ?? 8;
    if (reduced || cores < 4 || mem < 4) {
      cachedBase = "low";
      return cachedBase;
    }
  } catch { /* ignore */ }
  cachedBase = "high";
  return cachedBase;
}

/**
 * Đo FPS trung bình trong `windowMs`. Trả về promise resolve khi xong.
 * Dùng `requestAnimationFrame`. Không chạy trong SSR.
 */
export function sampleFps(windowMs = 1500): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") {
      resolve(60);
      return;
    }
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - start >= windowMs) {
        resolve((frames * 1000) / (now - start));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Quyết định effect-tier cuối cùng dựa trên gem value và perf mode.
 * gem < 10_000          → "light"
 * 10_000 ≤ gem < 100k   → "mid"
 * 100k   ≤ gem < 1M     → "premium"
 * gem ≥ 1_000_000       → "celebration"
 *
 * Nếu perf "low" → giảm 1 bậc (trừ "light").
 */
export type EffectTier = "light" | "mid" | "premium" | "celebration";

export function gemToEffectTier(gem: number, perf: PerfMode = detectBasePerfMode()): EffectTier {
  let t: EffectTier;
  if (gem >= 1_000_000) t = "celebration";
  else if (gem >= 100_000) t = "premium";
  else if (gem >= 10_000) t = "mid";
  else t = "light";

  if (perf === "low") {
    if (t === "celebration") return "premium";
    if (t === "premium") return "mid";
    if (t === "mid") return "light";
  }
  return t;
}
