/**
 * Leaderboard rank badges — two visually distinct sets.
 *
 * - <FollowRankBadge rank={1..10} />  → "Orbit / Connection" (blue-indigo, node ring)
 * - <StarRankBadge   rank={1..10} />  → "Celestial Star"    (gold-champagne, star medallion)
 *
 * Pure SVG, no external icon deps. `size` defaults to 32 (list) and scales up
 * cleanly for a hall-of-fame view. All animations respect prefers-reduced-motion.
 *
 * NOTE: These are presentational only. They never fetch data, never touch
 * business logic, and are safe to drop into any leaderboard row.
 */
import type { CSSProperties } from "react";

type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | number;

interface BadgeProps {
  rank: Rank;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/* --------------------------- shared helpers --------------------------- */

function clampRank(r: number): number {
  if (!Number.isFinite(r)) return 10;
  return Math.max(1, Math.min(10, Math.floor(r)));
}

/* --------------------- Set A: TOP FOLLOW — Orbit --------------------- */
/**
 * Palette per rank:
 *   1 → crown blue-silver, brightest halo
 *   2 → slate silver-blue
 *   3 → muted copper-blue
 *   4..10 → indigo/cyan variants dimming with rank
 */
const FOLLOW_PALETTE: Record<number, { ring: string; ring2: string; core: string; text: string; halo: string }> = {
  1:  { ring: "#e6f0ff", ring2: "#93c5fd", core: "#3b82f6", text: "#ffffff", halo: "rgba(59,130,246,0.55)" },
  2:  { ring: "#cbd5e1", ring2: "#94a3b8", core: "#64748b", text: "#ffffff", halo: "rgba(100,116,139,0.45)" },
  3:  { ring: "#c9b79a", ring2: "#a17e5c", core: "#7c5a3a", text: "#ffffff", halo: "rgba(124,90,58,0.40)" },
  4:  { ring: "#c7d2fe", ring2: "#818cf8", core: "#6366f1", text: "#ffffff", halo: "rgba(99,102,241,0.30)" },
  5:  { ring: "#bae6fd", ring2: "#7dd3fc", core: "#0ea5e9", text: "#ffffff", halo: "rgba(14,165,233,0.28)" },
  6:  { ring: "#c7d2fe", ring2: "#a5b4fc", core: "#4f46e5", text: "#ffffff", halo: "rgba(79,70,229,0.26)" },
  7:  { ring: "#a5f3fc", ring2: "#67e8f9", core: "#0891b2", text: "#ffffff", halo: "rgba(8,145,178,0.24)" },
  8:  { ring: "#dbeafe", ring2: "#93c5fd", core: "#2563eb", text: "#ffffff", halo: "rgba(37,99,235,0.22)" },
  9:  { ring: "#e0e7ff", ring2: "#a5b4fc", core: "#4338ca", text: "#ffffff", halo: "rgba(67,56,202,0.20)" },
  10: { ring: "#e2e8f0", ring2: "#94a3b8", core: "#475569", text: "#ffffff", halo: "rgba(71,85,105,0.18)" },
};

export function FollowRankBadge({ rank, size = 32, className, style }: BadgeProps) {
  const r = clampRank(rank);
  const p = FOLLOW_PALETTE[r] ?? FOLLOW_PALETTE[10];
  const isTop1 = r === 1;
  const uid = `frb-${r}`;

  return (
    <span
      className={`rank-badge follow-badge ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 999,
        position: "relative",
        filter: `drop-shadow(0 3px 8px ${p.halo})`,
        ...style,
      }}
      role="img"
      aria-label={`Top ${r} Follow`}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={`${uid}-core`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor={p.ring} />
            <stop offset="55%" stopColor={p.ring2} />
            <stop offset="100%" stopColor={p.core} />
          </radialGradient>
          <linearGradient id={`${uid}-orbit`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.ring} stopOpacity="0.9" />
            <stop offset="100%" stopColor={p.core} stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Outer orbit ring */}
        <circle cx="20" cy="20" r="18" fill="none" stroke={`url(#${uid}-orbit)`} strokeWidth="1.2" opacity="0.85" />

        {/* Rotating orbit (slow) with 3 nodes */}
        <g className="follow-badge__orbit">
          <circle cx="20" cy="20" r="15.5" fill="none" stroke={p.ring2} strokeOpacity="0.55" strokeWidth="0.8" />
          <circle cx="35.5" cy="20" r="1.3" fill={p.ring} />
          <circle cx="12.25" cy="6.6" r="0.9" fill={p.ring} opacity="0.85" />
          <circle cx="12.25" cy="33.4" r="0.9" fill={p.ring} opacity="0.85" />
        </g>

        {/* Core disc */}
        <circle cx="20" cy="20" r="12" fill={`url(#${uid}-core)`} />

        {/* Crown chevrons for Top 1..3 */}
        {r === 1 ? (
          <path
            d="M13 15 L17 18 L20 13 L23 18 L27 15 L26 21 L14 21 Z"
            fill={p.text}
            opacity="0.95"
          />
        ) : null}

        {/* Rank number */}
        <text
          x="20"
          y={r === 1 ? 27 : 24}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={800}
          fontSize={r === 1 ? 8 : 12}
          fill={p.text}
          style={{ letterSpacing: "-0.02em" }}
        >
          {r}
        </text>
      </svg>

      <style>{`
        .follow-badge__orbit {
          transform-origin: 20px 20px;
          animation: follow-badge-spin 8s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .follow-badge__orbit { animation: none; }
        }
        @keyframes follow-badge-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        ${isTop1 ? `
          .follow-badge { animation: follow-badge-shine 5s ease-in-out infinite; }
          @keyframes follow-badge-shine {
            0%,100% { filter: drop-shadow(0 3px 8px ${p.halo}); }
            50%     { filter: drop-shadow(0 4px 14px ${p.halo}); }
          }
          @media (prefers-reduced-motion: reduce) {
            .follow-badge { animation: none; }
          }
        ` : ""}
      `}</style>
    </span>
  );
}

/* --------------------- Set B: TOP STARS — Celestial --------------------- */
/**
 * Palette per rank:
 *   1 → premium champagne gold
 *   2 → silver-lilac
 *   3 → bronze-rose
 *   4..10 → rose/violet gradient dimming with rank
 */
const STAR_PALETTE: Record<number, { ring: string; core: string; star: string; text: string; halo: string }> = {
  1:  { ring: "#fde68a", core: "#f59e0b", star: "#fffbe6", text: "#3a2a00", halo: "rgba(245,158,11,0.55)" },
  2:  { ring: "#e9d5ff", core: "#a78bfa", star: "#f5f3ff", text: "#241242", halo: "rgba(167,139,250,0.45)" },
  3:  { ring: "#fecdd3", core: "#e11d48", star: "#fff1f2", text: "#4b0616", halo: "rgba(225,29,72,0.40)" },
  4:  { ring: "#f5d0fe", core: "#c026d3", star: "#faf5ff", text: "#3b0a4a", halo: "rgba(192,38,211,0.30)" },
  5:  { ring: "#fbcfe8", core: "#db2777", star: "#fdf2f8", text: "#4a0b2b", halo: "rgba(219,39,119,0.28)" },
  6:  { ring: "#ddd6fe", core: "#7c3aed", star: "#f5f3ff", text: "#2b0b6b", halo: "rgba(124,58,237,0.26)" },
  7:  { ring: "#f5d0fe", core: "#a21caf", star: "#faf5ff", text: "#3b0a4a", halo: "rgba(162,28,175,0.22)" },
  8:  { ring: "#fbcfe8", core: "#be185d", star: "#fdf2f8", text: "#4a0b2b", halo: "rgba(190,24,93,0.20)" },
  9:  { ring: "#e9d5ff", core: "#6d28d9", star: "#f5f3ff", text: "#2b0b6b", halo: "rgba(109,40,217,0.18)" },
  10: { ring: "#fce7f3", core: "#9d174d", star: "#fdf2f8", text: "#4a0b2b", halo: "rgba(157,23,77,0.16)" },
};

export function StarRankBadge({ rank, size = 32, className, style }: BadgeProps) {
  const r = clampRank(rank);
  const p = STAR_PALETTE[r] ?? STAR_PALETTE[10];
  const uid = `srb-${r}`;
  const isTop1 = r === 1;

  return (
    <span
      className={`rank-badge star-badge ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 999,
        position: "relative",
        filter: `drop-shadow(0 3px 8px ${p.halo})`,
        ...style,
      }}
      role="img"
      aria-label={`Top ${r} Ngôi Sao`}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={`${uid}-med`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={p.ring} />
            <stop offset="100%" stopColor={p.core} />
          </radialGradient>
        </defs>

        {/* Medallion outer */}
        <circle cx="20" cy="20" r="18" fill={`url(#${uid}-med)`} />
        <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />

        {/* Soft halo for Top 1 */}
        {isTop1 ? (
          <circle cx="20" cy="20" r="19" fill="none" stroke={p.ring} strokeOpacity="0.55" strokeWidth="1.2" className="star-badge__halo" />
        ) : null}

        {/* Rounded 5-point star */}
        <path
          d="M20 8.5
             L22.6 15.7
             L30.3 16.1
             L24.3 20.9
             L26.4 28.3
             L20 24.1
             L13.6 28.3
             L15.7 20.9
             L9.7 16.1
             L17.4 15.7 Z"
          fill={p.star}
          opacity={r === 1 ? 0.95 : 0.85}
        />

        {/* Rank number bottom-right chip */}
        <g>
          <circle cx="30" cy="30" r="7" fill={p.core} stroke={p.ring} strokeWidth="0.8" />
          <text
            x="30"
            y="32.6"
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={800}
            fontSize={r === 10 ? 6.5 : 8}
            fill="#ffffff"
            style={{ letterSpacing: "-0.02em" }}
          >
            {r}
          </text>
        </g>

        {/* One-shot sparkle on Top 1..3 (CSS animation) */}
        {r <= 3 ? (
          <g className="star-badge__spark">
            <circle cx="9" cy="10" r="0.9" fill="#ffffff" />
            <circle cx="31" cy="9" r="0.7" fill="#ffffff" />
            <circle cx="10" cy="30" r="0.5" fill="#ffffff" />
          </g>
        ) : null}
      </svg>

      <style>{`
        .star-badge__spark {
          transform-origin: 20px 20px;
          animation: star-badge-sparkle 2.2s ease-out 1;
        }
        .star-badge__halo {
          transform-origin: 20px 20px;
          animation: star-badge-halo 4.5s ease-in-out infinite;
        }
        @keyframes star-badge-sparkle {
          0%   { opacity: 0; transform: scale(0.6); }
          40%  { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.85; transform: scale(1); }
        }
        @keyframes star-badge-halo {
          0%,100% { opacity: 0.35; }
          50%     { opacity: 0.75; }
        }
        @media (prefers-reduced-motion: reduce) {
          .star-badge__spark, .star-badge__halo { animation: none; }
        }
      `}</style>
    </span>
  );
}

/** Convenience: pick badge by leaderboard group. */
export function LeaderboardBadge({
  group,
  rank,
  size,
  className,
  style,
}: {
  group: "follow" | "stars";
  rank: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return group === "stars" ? (
    <StarRankBadge rank={rank} size={size} className={className} style={style} />
  ) : (
    <FollowRankBadge rank={rank} size={size} className={className} style={style} />
  );
}
