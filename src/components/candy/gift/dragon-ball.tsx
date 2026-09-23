/**
 * <DragonBall size={40} stars={4} /> — Ngọc Rồng vẽ bằng SVG.
 * Quả cầu hổ phách bóng 3D (radial gradient) + số sao đỏ 1..7 xếp cân đối.
 */
import { useId } from "react";

export type DragonBallStars = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface DragonBallProps {
  /** Kích thước tính bằng pixel. */
  size?: number;
  /** Số sao 1..7. */
  stars?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Làm xám (chưa sở hữu). */
  dim?: boolean;
  glow?: boolean;
}

/** Bố cục sao cân đối trong hệ toạ độ 100x100 — [x, y, bán kính]. */
const STAR_LAYOUTS: Record<number, Array<[number, number, number]>> = {
  1: [[50, 50, 21]],
  2: [
    [38, 50, 15],
    [62, 50, 15],
  ],
  3: [
    [50, 36, 14],
    [38, 60, 14],
    [62, 60, 14],
  ],
  4: [
    [38, 38, 13],
    [62, 38, 13],
    [38, 62, 13],
    [62, 62, 13],
  ],
  5: [
    [38, 38, 12],
    [62, 38, 12],
    [50, 50, 12],
    [38, 62, 12],
    [62, 62, 12],
  ],
  6: [
    [37, 34, 11],
    [50, 34, 11],
    [63, 34, 11],
    [37, 60, 11],
    [50, 60, 11],
    [63, 60, 11],
  ],
  7: [
    [50, 28, 10],
    [36, 40, 10],
    [64, 40, 10],
    [50, 50, 10],
    [30, 60, 10],
    [70, 60, 10],
    [50, 71, 10],
  ],
};

function starPath(cx: number, cy: number, r: number) {
  const inner = r * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : inner;
    const rad = ((i * 36 - 90) * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(rad) * rr).toFixed(2)},${(cy + Math.sin(rad) * rr).toFixed(2)}`);
  }
  return `M${pts[0]} L${pts.slice(1).join(" L")} Z`;
}

export function DragonBall({
  size = 40,
  stars = 1,
  className,
  style,
  dim = false,
  glow = true,
}: DragonBallProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = Math.min(7, Math.max(1, Math.round(stars))) as DragonBallStars;
  const orb = `db-orb-${uid}`;
  const rim = `db-rim-${uid}`;
  const shine = `db-shine-${uid}`;
  const star = `db-star-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Ngọc Rồng ${n} sao`}
      style={{
        flexShrink: 0,
        filter: dim
          ? "grayscale(1) opacity(0.5)"
          : glow
            ? "drop-shadow(0 4px 10px rgba(255,140,20,0.4)) drop-shadow(0 1px 2px rgba(0,0,0,0.25))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
        ...style,
      }}
    >
      <defs>
        <radialGradient id={orb} cx="34%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="18%" stopColor="#ffe7a8" />
          <stop offset="48%" stopColor="#ffb43d" />
          <stop offset="80%" stopColor="#f4830d" />
          <stop offset="100%" stopColor="#a9500a" />
        </radialGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd989" />
          <stop offset="100%" stopColor="#7a3a05" />
        </linearGradient>
        <linearGradient id={star} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6152" />
          <stop offset="100%" stopColor="#9d1010" />
        </linearGradient>
        <radialGradient id={shine} cx="35%" cy="25%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="47" fill={`url(#${rim})`} />
      <circle cx="50" cy="50" r="43" fill={`url(#${orb})`} />

      {STAR_LAYOUTS[n].map(([cx, cy, r], i) => (
        <path
          key={i}
          d={starPath(cx, cy, r)}
          fill={`url(#${star})`}
          stroke="#5a0808"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      ))}

      <ellipse cx="37" cy="29" rx="17" ry="9.5" fill={`url(#${shine})`} />
      <ellipse cx="62" cy="76" rx="12" ry="6" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

/** Chọn ngẫu nhiên số sao 1..7 cho vật phẩm DRAGON_BALL. */
export const randomDragonBallStars = (): DragonBallStars =>
  ((Math.floor(Math.random() * 7) + 1) as DragonBallStars);

export default DragonBall;
