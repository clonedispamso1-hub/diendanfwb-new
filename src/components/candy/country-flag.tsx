import type { CSSProperties } from "react";

export type CountryFlagType = "vn" | "tw" | "jp" | "us" | "kr" | "cn";

/** 5-point star polygon points centered at (cx, cy) with outer radius r. */
function starPoints(cx: number, cy: number, r: number): string {
  const inner = r * 0.382;
  const points: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const outerAngle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / 5;
    points.push(`${(cx + r * Math.cos(outerAngle)).toFixed(2)},${(cy + r * Math.sin(outerAngle)).toFixed(2)}`);
    points.push(`${(cx + inner * Math.cos(innerAngle)).toFixed(2)},${(cy + inner * Math.sin(innerAngle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** 12-ray White Sun polygon for the Taiwan canton. */
function sunPoints(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const rayAngle = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    const gapAngle = rayAngle + Math.PI / 12;
    points.push(`${(cx + outer * Math.cos(rayAngle)).toFixed(2)},${(cy + outer * Math.sin(rayAngle)).toFixed(2)}`);
    points.push(`${(cx + inner * Math.cos(gapAngle)).toFixed(2)},${(cy + inner * Math.sin(gapAngle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** US star field: 9 rows alternating 6 / 5 stars. */
const US_STAR_ROWS = Array.from({ length: 9 }, (_, row) => {
  const count = row % 2 === 0 ? 6 : 5;
  const y = 0.8 + row * 0.8;
  return Array.from({ length: count }, (_, column) => {
    const offset = row % 2 === 0 ? 0.85 : 1.6;
    return { x: offset + column * 1.5, y };
  });
}).flat();

function VnFlag() {
  return (
    <g>
      <rect width="22" height="15" rx="2.5" fill="#DA251D" />
      <polygon points={starPoints(11, 7.5, 4.6)} fill="#FFFF00" />
    </g>
  );
}

function TwFlag() {
  return (
    <g>
      <rect width="22" height="15" rx="2.5" fill="#FE0000" />
      <rect width="11" height="10" fill="#000095" />
      <polygon points={sunPoints(5.5, 5, 3.3, 1.15)} fill="#FFFFFF" />
      <circle cx="5.5" cy="5" r="1.55" fill="#FFFFFF" />
      <circle cx="5.5" cy="5" r="0.95" fill="#000095" />
      <circle cx="5.5" cy="5" r="0.6" fill="#FFFFFF" />
    </g>
  );
}

function JpFlag() {
  return (
    <g>
      <rect width="22" height="15" rx="2.5" fill="#FFFFFF" />
      <circle cx="11" cy="7.5" r="4.2" fill="#BC002D" />
    </g>
  );
}

function UsFlag() {
  const stripeHeight = 15 / 13;
  const stripes = Array.from({ length: 13 }, (_, index) => (
    <rect
      key={index}
      y={index * stripeHeight}
      width="22"
      height={stripeHeight + 0.05}
      fill={index % 2 === 0 ? "#B22234" : "#FFFFFF"}
    />
  ));
  return (
    <g>
      {stripes}
      <rect width="8.8" height={stripeHeight * 7} fill="#3C3B6E" />
      {US_STAR_ROWS.map((star, index) => (
        <polygon key={index} points={starPoints(star.x, star.y, 0.52)} fill="#FFFFFF" />
      ))}
    </g>
  );
}

/** South Korea: white field, Taeguk circle, 4 simplified trigrams. */
function KrFlag() {
  const trigram = (tx: number, ty: number, rotate: number) => (
    <g transform={`translate(${tx} ${ty}) rotate(${rotate})`}>
      <rect x="-2.1" y="-1.15" width="4.2" height="0.62" rx="0.28" fill="#000000" />
      <rect x="-2.1" y="-0.09" width="4.2" height="0.62" rx="0.28" fill="#000000" />
      <rect x="-2.1" y="0.97" width="4.2" height="0.62" rx="0.28" fill="#000000" />
    </g>
  );
  return (
    <g>
      <rect width="22" height="15" rx="2.5" fill="#FFFFFF" />
      {trigram(4.2, 3.5, -45)}
      {trigram(17.8, 3.5, 45)}
      {trigram(4.2, 11.5, 45)}
      {trigram(17.8, 11.5, -45)}
      <circle cx="11" cy="7.5" r="2.7" fill="#C60C30" />
      <path d="M 8.3 7.5 A 2.7 2.7 0 0 1 13.7 7.5 Z" fill="#003478" />
    </g>
  );
}

/** China: red field, one large golden star + 4 small ones. */
function CnFlag() {
  const smallStars: Array<[number, number]> = [
    [8.7, 2.0], [10.1, 3.6], [10.1, 5.6], [8.7, 7.2],
  ];
  return (
    <g>
      <rect width="22" height="15" rx="2.5" fill="#DE2910" />
      <polygon points={starPoints(4.2, 4.2, 1.9)} fill="#FFDE00" />
      {smallStars.map(([x, y], index) => (
        <polygon key={index} points={starPoints(x, y, 0.62)} fill="#FFDE00" />
      ))}
    </g>
  );
}

const FLAGS: Record<CountryFlagType, () => React.JSX.Element> = {
  vn: VnFlag,
  tw: TwFlag,
  jp: JpFlag,
  us: UsFlag,
  kr: KrFlag,
  cn: CnFlag,
};

interface CountryFlagProps {
  country: CountryFlagType;
  className?: string;
  style?: CSSProperties;
}

/** Real SVG flag icon — never a two-letter text badge. */
export function CountryFlag({ country, className, style }: CountryFlagProps) {
  const Flag = FLAGS[country];
  return (
    <svg
      className={className}
      style={style}
      width="22"
      height="15"
      viewBox="0 0 22 15"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <Flag />
      <rect x="0.25" y="0.25" width="21.5" height="14.5" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.5" />
    </svg>
  );
}
