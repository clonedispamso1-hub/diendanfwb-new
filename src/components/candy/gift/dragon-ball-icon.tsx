/**
 * DragonBallIcon — bộ 7 viên ngọc (1..7 sao) render SVG.
 * Thiết kế riêng: quả cầu cam bóng, sao đỏ 5 cánh, đổ bóng + viền sáng.
 * Không sử dụng artwork bản quyền của bên thứ ba.
 */
import { useId } from "react";

export type BallTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface Props {
  tier: BallTier;
  size?: number;
  className?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}

// Toạ độ sao trong hệ 100x100 (tâm 50,50). Bố cục tương tự bộ Ngọc Rồng cổ điển.
const STAR_LAYOUTS: Record<BallTier, Array<[number, number, number]>> = {
  // [x, y, size]
  1: [[50, 50, 22]],
  2: [
    [38, 50, 16],
    [62, 50, 16],
  ],
  3: [
    [50, 36, 14],
    [38, 58, 14],
    [62, 58, 14],
  ],
  4: [
    [38, 38, 13],
    [62, 38, 13],
    [38, 62, 13],
    [62, 62, 13],
  ],
  5: [
    [50, 34, 12],
    [34, 46, 12],
    [66, 46, 12],
    [40, 64, 12],
    [60, 64, 12],
  ],
  6: [
    [38, 34, 11],
    [50, 34, 11],
    [62, 34, 11],
    [38, 60, 11],
    [50, 60, 11],
    [62, 60, 11],
  ],
  7: [
    [50, 30, 10],
    [36, 40, 10],
    [64, 40, 10],
    [30, 58, 10],
    [50, 54, 10],
    [70, 58, 10],
    [50, 70, 10],
  ],
};

/** Đường đi cho ngôi sao 5 cánh nội tiếp bán kính r, tâm (cx,cy). */
function starPath(cx: number, cy: number, r: number) {
  const outer = r;
  const inner = r * 0.42;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const isOuter = i % 2 === 0;
    const rad = ((i * 36 - 90) * Math.PI) / 180;
    const rr = isOuter ? outer : inner;
    const x = cx + Math.cos(rad) * rr;
    const y = cy + Math.sin(rad) * rr;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${points[0]} L${points.slice(1).join(" L")} Z`;
}

export function DragonBallIcon({ tier, size = 40, className, glow = true, style }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const orbGrad = `dbOrb-${uid}`;
  const rimGrad = `dbRim-${uid}`;
  const shine = `dbShine-${uid}`;
  const starGrad = `dbStar-${uid}`;

  const stars = STAR_LAYOUTS[tier];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{
        filter: glow
          ? "drop-shadow(0 4px 10px rgba(255,120,20,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.25))"
          : "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
        ...style,
      }}
      aria-label={`Ngọc Rồng ${tier} sao`}
      role="img"
    >
      <defs>
        <radialGradient id={orbGrad} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff6d5" />
          <stop offset="20%" stopColor="#ffd980" />
          <stop offset="55%" stopColor="#ff9a2b" />
          <stop offset="100%" stopColor="#b3560d" />
        </radialGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffca6a" />
          <stop offset="100%" stopColor="#7a3a05" />
        </linearGradient>
        <linearGradient id={starGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5a4a" />
          <stop offset="100%" stopColor="#a01212" />
        </linearGradient>
        <radialGradient id={shine} cx="35%" cy="25%" r="35%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* rim */}
      <circle cx="50" cy="50" r="47" fill={`url(#${rimGrad})`} />
      {/* orb */}
      <circle cx="50" cy="50" r="43" fill={`url(#${orbGrad})`} />

      {/* stars */}
      {stars.map(([cx, cy, r], i) => (
        <path
          key={i}
          d={starPath(cx, cy, r)}
          fill={`url(#${starGrad})`}
          stroke="#5a0808"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      ))}

      {/* glossy highlight ở góc trên trái */}
      <ellipse cx="38" cy="30" rx="18" ry="10" fill={`url(#${shine})`} />
    </svg>
  );
}
