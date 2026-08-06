/**
 * SlotReel — hiệu ứng "quay số" như máy jackpot cho Kết Nối Bí Mật V2.
 *
 * Chạy rất nhanh lúc đầu, chậm dần (ease-out), rồi dừng đúng ở `finalValue`.
 * Dùng cho tuổi (18–60) và khu vực (quận/huyện theo tỉnh của user).
 */
import { useEffect, useRef, useState } from "react";

/** Danh sách tuổi hợp lệ: KHÔNG BAO GIỜ dưới 18, tối đa 60. */
export const AGE_REEL: number[] = Array.from({ length: 60 - 18 + 1 }, (_, i) => 18 + i);

/** Ép mọi giá trị tuổi về khoảng an toàn 18–60. */
export function clampAge(age: number | null | undefined): number {
  const n = Number(age);
  if (!Number.isFinite(n)) return 24;
  return Math.min(60, Math.max(18, Math.round(n)));
}

interface SlotReelProps<T> {
  items: T[];
  /** Giá trị dừng cuối cùng. */
  finalValue: T;
  /** Đang quay hay không (false = hiện luôn finalValue). */
  spinning?: boolean;
  /** Tổng thời gian quay (ms). */
  duration?: number;
  render?: (value: T) => React.ReactNode;
  className?: string;
}

export function SlotReel<T>({
  items,
  finalValue,
  spinning = true,
  duration = 2600,
  render,
  className,
}: SlotReelProps<T>) {
  const pool = items.length ? items : [finalValue];
  const [value, setValue] = useState<T>(spinning ? (pool[0] as T) : finalValue);
  const [done, setDone] = useState(!spinning);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!spinning) {
      setValue(finalValue);
      setDone(true);
      return;
    }
    setDone(false);
    const start = performance.now();
    let i = Math.floor(Math.random() * pool.length);
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const t = Math.min(1, (performance.now() - start) / duration);
      if (t >= 1) {
        setValue(finalValue);
        setDone(true);
        return;
      }
      i = (i + 1) % pool.length;
      setValue(pool[i] as T);
      // 35ms lúc đầu -> ~260ms lúc gần dừng (chậm dần).
      const delay = 35 + Math.pow(t, 3) * 260;
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, 35);

    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, duration, finalValue, items.length]);

  return (
    <span className={`sc-reel${done ? " sc-reel--locked" : " sc-reel--spin"} ${className || ""}`}>
      {render ? render(value) : String(value)}
    </span>
  );
}

export default SlotReel;
