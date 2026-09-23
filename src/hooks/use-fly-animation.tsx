/**
 * useFlyAnimation — hiệu ứng "bay vật phẩm" DÙNG CHUNG cho toàn website.
 *
 * Đặc điểm:
 *  • Chỉ animate `transform` + `opacity` (translate3d + will-change) → chạy trên GPU, không reflow.
 *  • Đường bay parabol (from → mid → to), toả nhẹ khi bắn nhiều hạt cùng lúc.
 *  • Hạt tự dọn khỏi state sau khi bay xong → không rò rỉ DOM.
 *
 * Cách dùng:
 *   const { fly, FlyLayer } = useFlyAnimation();
 *   fly({ emoji: "🪙", from: buttonEl, to: walletRef.current, count: 4, size: 20 });
 *   return <>{...}<FlyLayer /></>;
 */
import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";

export type FlyPoint = { x: number; y: number };
type FlySource = HTMLElement | FlyPoint | null | undefined;

export interface FlyOptions {
  /** Emoji / ký tự hiển thị khi bay. */
  emoji: string;
  /** Điểm bắt đầu: element trên màn hình hoặc toạ độ viewport. */
  from: FlySource;
  /** Điểm đích: element (ví, rương…) hoặc toạ độ viewport. */
  to: FlySource;
  /** Số hạt bắn ra (mặc định 1). */
  count?: number;
  /** Cỡ chữ của hạt, px (mặc định 22). */
  size?: number;
  /** Thời lượng bay, giây (mặc định 0.6). */
  duration?: number;
}

interface Particle {
  id: string;
  emoji: string;
  from: FlyPoint;
  mid: FlyPoint;
  to: FlyPoint;
  size: number;
  delay: number;
  duration: number;
}

function toPoint(src: FlySource): FlyPoint | null {
  if (!src) return null;
  if (typeof (src as HTMLElement).getBoundingClientRect === "function") {
    const r = (src as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const p = src as FlyPoint;
  return typeof p.x === "number" && typeof p.y === "number" ? p : null;
}

export function useFlyAnimation() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const seq = useRef(0);

  const fly = useCallback((opts: FlyOptions) => {
    const from = toPoint(opts.from);
    const to = toPoint(opts.to);
    if (!from || !to) return;
    const count = Math.max(1, opts.count ?? 1);
    const size = opts.size ?? 22;
    const duration = opts.duration ?? 0.6;
    const stamp = ++seq.current;

    const batch: Particle[] = Array.from({ length: count }, (_, i) => {
      const spread = (i - (count - 1) / 2) * 26;
      return {
        id: `fly-${stamp}-${i}`,
        emoji: opts.emoji,
        from: { x: from.x + spread * 0.4, y: from.y },
        mid: {
          x: (from.x + to.x) / 2 + spread,
          y: Math.min(from.y, to.y) - 90 - Math.abs(spread),
        },
        to,
        size,
        delay: i * 0.05,
        duration,
      };
    });

    setParticles((prev) => [...prev, ...batch]);
    const ids = new Set(batch.map((p) => p.id));
    window.setTimeout(
      () => setParticles((prev) => prev.filter((p) => !ids.has(p.id))),
      (duration + count * 0.05) * 1000 + 400,
    );
  }, []);

  const FlyLayer = useCallback(
    () => (
      <>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              transform: `translate3d(${p.from.x}px, ${p.from.y}px, 0) scale(1)`,
              opacity: 1,
            }}
            animate={{
              transform: [
                `translate3d(${p.from.x}px, ${p.from.y}px, 0) scale(1)`,
                `translate3d(${p.mid.x}px, ${p.mid.y}px, 0) scale(1.15)`,
                `translate3d(${p.to.x}px, ${p.to.y}px, 0) scale(0.35)`,
              ],
              opacity: [1, 1, 0.15],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              times: [0, 0.55, 1],
              ease: [0.25, 0.75, 0.35, 1],
            }}
            style={{ fontSize: p.size, willChange: "transform, opacity" }}
            className="pointer-events-none fixed left-0 top-0 z-[2147483646] -ml-4 -mt-4 grid h-8 w-8 place-items-center leading-none drop-shadow-[0_4px_10px_rgba(245,158,11,.45)]"
          >
            {p.emoji}
          </motion.div>
        ))}
      </>
    ),
    [particles],
  );

  return { fly, FlyLayer };
}

export default useFlyAnimation;
