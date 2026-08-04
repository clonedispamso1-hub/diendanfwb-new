/**
 * 3D gold coin SVG icon — drop-in replacement for lucide Coins.
 * Use: <CoinIcon size={16} />
 */
interface Props {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}
export function CoinIcon({ size = 16, className, style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ filter: "drop-shadow(0 2px 3px rgba(120, 80, 0, 0.45))", ...style }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="coinFace" cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#fffdf0" />
          <stop offset="25%" stopColor="#ffe680" />
          <stop offset="60%" stopColor="#f5b50a" />
          <stop offset="100%" stopColor="#8a5a00" />
        </radialGradient>
        <linearGradient id="coinEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c542" />
          <stop offset="100%" stopColor="#5a3a00" />
        </linearGradient>
        <linearGradient id="coinShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* outer rim */}
      <circle cx="12" cy="12" r="10" fill="url(#coinEdge)" />
      {/* face */}
      <circle cx="12" cy="11.4" r="9" fill="url(#coinFace)" />
      {/* inner ring */}
      <circle cx="12" cy="11.4" r="6.5" fill="none" stroke="#fff3b0" strokeWidth="0.5" opacity="0.85" />
      {/* glossy highlight */}
      <ellipse cx="9.2" cy="8.4" rx="3.6" ry="1.6" fill="url(#coinShine)" opacity="0.8" />
      {/* G monogram for Gem/Gold */}
      <text
        x="12"
        y="14.7"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="900"
        fontFamily="'Playfair Display', Georgia, serif"
        fill="#7a4a00"
      >
        G
      </text>
    </svg>
  );
}
