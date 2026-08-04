import type { CSSProperties } from "react";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export type EggConfig = {
  id: number;
  name: string;
  rarity: Rarity;
  palette: [string, string, string]; // shell top, shell bottom, spot / accent
  glow: string;
  pattern:
    | "plain"
    | "dots"
    | "stripes"
    | "scales"
    | "stars"
    | "cracks"
    | "flames"
    | "crystals"
    | "leaves"
    | "waves"
    | "nebula"
    | "runes"
    | "hearts"
    | "checker"
    | "zigzag";
  species: string; // pet species id it hatches into
};

// ----- Palette + name banks used by the 100-egg generator -----
const PALETTES: Array<[string, string, string, string]> = [
  // top, bottom, accent, glow
  ["#a7f3d0", "#059669", "#065f46", "#34d399"], // forest
  ["#fde68a", "#f97316", "#7c2d12", "#fbbf24"], // fire
  ["#bae6fd", "#0284c7", "#0c4a6e", "#38bdf8"], // ice
  ["#c7d2fe", "#4338ca", "#1e1b4b", "#818cf8"], // galaxy
  ["#4b5563", "#111827", "#000000", "#6b7280"], // shadow
  ["#fce7f3", "#db2777", "#831843", "#f472b6"], // crystal-pink
  ["#d9f99d", "#65a30d", "#365314", "#a3e635"], // nature
  ["#e9d5ff", "#7c3aed", "#3b0764", "#a78bfa"], // magic
  ["#fef3c7", "#f59e0b", "#78350f", "#fde047"], // golden
  ["#fecaca", "#dc2626", "#7f1d1d", "#f87171"], // dragon
  ["#e0f2fe", "#0369a1", "#082f49", "#22d3ee"], // ocean
  ["#fef9c3", "#eab308", "#713f12", "#fde68a"], // sun
  ["#f5d0fe", "#a21caf", "#4a044e", "#e879f9"], // amethyst
  ["#dcfce7", "#16a34a", "#14532d", "#4ade80"], // emerald
  ["#fee2e2", "#ef4444", "#7f1d1d", "#fda4af"], // ruby
  ["#e2e8f0", "#334155", "#0f172a", "#94a3b8"], // steel
  ["#ffedd5", "#ea580c", "#7c2d12", "#fdba74"], // pumpkin
  ["#cffafe", "#0891b2", "#164e63", "#67e8f9"], // aqua
  ["#f3e8ff", "#9333ea", "#581c87", "#c084fc"], // twilight
  ["#ecfccb", "#84cc16", "#3f6212", "#bef264"], // meadow
  ["#f0abfc", "#c026d3", "#701a75", "#e879f9"], // orchid
  ["#fda4af", "#e11d48", "#881337", "#fb7185"], // rose
  ["#a5f3fc", "#0e7490", "#155e75", "#22d3ee"], // teal
  ["#fef08a", "#ca8a04", "#713f12", "#fde047"], // honey
  ["#ddd6fe", "#6d28d9", "#4c1d95", "#8b5cf6"], // violet
];

const PATTERNS: EggConfig["pattern"][] = [
  "plain", "dots", "stripes", "scales", "stars", "cracks", "flames",
  "crystals", "leaves", "waves", "nebula", "runes", "hearts", "checker", "zigzag",
];

const NAME_PREFIXES = [
  "Forest", "Fire", "Ice", "Galaxy", "Shadow", "Crystal", "Nature", "Magic",
  "Golden", "Dragon", "Ocean", "Sun", "Amethyst", "Emerald", "Ruby", "Steel",
  "Pumpkin", "Aqua", "Twilight", "Meadow", "Orchid", "Rose", "Teal", "Honey", "Violet",
  "Storm", "Cloud", "Aurora", "Ember", "Frost", "Nebula", "Mystic", "Verdant",
  "Moon", "Star", "Comet", "Blossom", "Thunder", "Dawn", "Dusk", "Prism",
];
const NAME_SUFFIXES = ["Egg", "Shell", "Orb", "Bud", "Seed", "Pod", "Gem", "Core", "Sphere", "Bloom"];

// 100 unique pet species — pet_001 .. pet_100 defined in ./pets.tsx.
const SPECIES_POOL = Array.from({ length: 100 }, (_, i) => `pet_${String(i + 1).padStart(3, "0")}`);

function rarityForIndex(i: number): Rarity {
  if (i >= 95) return "mythic";
  if (i >= 85) return "legendary";
  if (i >= 70) return "epic";
  if (i >= 50) return "rare";
  if (i >= 25) return "uncommon";
  return "common";
}

// Deterministic 100 unique egg configs
export const EGGS: EggConfig[] = Array.from({ length: 100 }, (_, i) => {
  const pal = PALETTES[i % PALETTES.length];
  const pattern = PATTERNS[(i * 3) % PATTERNS.length];
  const prefix = NAME_PREFIXES[i % NAME_PREFIXES.length];
  const suffix = NAME_SUFFIXES[(Math.floor(i / NAME_PREFIXES.length)) % NAME_SUFFIXES.length];
  const species = SPECIES_POOL[i % SPECIES_POOL.length];
  const rarity = rarityForIndex(i);
  return {
    id: i + 1,
    name: `${prefix} ${suffix}`,
    rarity,
    palette: [pal[0], pal[1], pal[2]],
    glow: pal[3],
    pattern,
    species,
  };
});

export const RARITY_META: Record<Rarity, { label: string; color: string; ring: string }> = {
  common:    { label: "Common",    color: "#94a3b8", ring: "0 0 0 2px rgba(148,163,184,0.5)" },
  uncommon:  { label: "Uncommon",  color: "#34d399", ring: "0 0 0 2px rgba(52,211,153,0.6)" },
  rare:      { label: "Rare",      color: "#38bdf8", ring: "0 0 0 2px rgba(56,189,248,0.7)" },
  epic:      { label: "Epic",      color: "#a78bfa", ring: "0 0 0 2px rgba(167,139,250,0.75)" },
  legendary: { label: "Legendary", color: "#fbbf24", ring: "0 0 0 2px rgba(251,191,36,0.8)" },
  mythic:    { label: "Mythic",    color: "#f472b6", ring: "0 0 0 2px rgba(244,114,182,0.85)" },
};

// ---------------- Egg SVG ----------------
export function EggSVG({
  egg,
  size = 120,
  animate = true,
  hatching = false,
  style,
}: {
  egg: EggConfig;
  size?: number;
  animate?: boolean;
  hatching?: boolean;
  style?: CSSProperties;
}) {
  const [top, bottom, accent] = egg.palette;
  const gradId = `eg-${egg.id}`;
  const glowId = `eg-glow-${egg.id}`;
  return (
    <div
      className={`pw-egg${animate ? " pw-egg-float" : ""}${hatching ? " pw-egg-shake" : ""}`}
      style={{ width: size, height: size, position: "relative", ...style }}
    >
      <svg viewBox="0 0 100 120" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={top} />
            <stop offset="100%" stopColor={bottom} />
          </linearGradient>
          <radialGradient id={glowId} cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor={egg.glow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={egg.glow} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip-${egg.id}`}>
            <path d="M50 4 C22 4 8 44 8 74 C8 100 28 116 50 116 C72 116 92 100 92 74 C92 44 78 4 50 4 Z" />
          </clipPath>
        </defs>
        {/* Glow halo */}
        <ellipse cx="50" cy="60" rx="52" ry="58" fill={`url(#${glowId})`} />
        {/* Shell body */}
        <path
          d="M50 4 C22 4 8 44 8 74 C8 100 28 116 50 116 C72 116 92 100 92 74 C92 44 78 4 50 4 Z"
          fill={`url(#${gradId})`}
          stroke={accent}
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        {/* Pattern overlay clipped to shell */}
        <g clipPath={`url(#clip-${egg.id})`} opacity="0.9">
          <PatternLayer pattern={egg.pattern} accent={accent} glow={egg.glow} />
        </g>
        {/* Highlight */}
        <ellipse cx="35" cy="35" rx="10" ry="16" fill="white" opacity="0.35" />
        {/* Shadow */}
        <ellipse cx="50" cy="118" rx="26" ry="4" fill="black" opacity="0.18" />
      </svg>
    </div>
  );
}

function PatternLayer({ pattern, accent, glow }: { pattern: EggConfig["pattern"]; accent: string; glow: string }) {
  switch (pattern) {
    case "dots":
      return (
        <>
          {[[25,40],[65,30],[42,60],[75,75],[20,85],[55,95],[80,55],[35,20]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={5} fill={accent} opacity={0.55} />
          ))}
        </>
      );
    case "stripes":
      return (
        <>
          {[15,35,55,75,95].map((y,i) => (
            <rect key={i} x={0} y={y} width={100} height={5} fill={accent} opacity={0.4} />
          ))}
        </>
      );
    case "scales":
      return (
        <>
          {Array.from({length: 6}).flatMap((_,row) =>
            Array.from({length: 6}).map((__,col) => (
              <circle key={`${row}-${col}`} cx={10+col*16+(row%2?8:0)} cy={20+row*15} r={7} fill="none" stroke={accent} strokeOpacity={0.45} strokeWidth={1.2}/>
            ))
          )}
        </>
      );
    case "stars":
      return (
        <>
          {[[30,30],[70,45],[50,70],[25,80],[75,85],[45,25]].map(([x,y],i) => (
            <polygon key={i} points={starPoints(x,y,5,2)} fill={glow} opacity={0.7} />
          ))}
        </>
      );
    case "cracks":
      return (
        <>
          <path d="M30 20 L45 45 L38 60 L55 80 L48 105" stroke={accent} strokeWidth={1.5} fill="none" opacity={0.6}/>
          <path d="M70 25 L58 50 L72 70 L60 95" stroke={accent} strokeWidth={1.5} fill="none" opacity={0.6}/>
        </>
      );
    case "flames":
      return (
        <>
          {[20,50,80].map((x,i) => (
            <path key={i} d={`M${x} 100 Q${x-8} 80 ${x} 65 Q${x+6} 80 ${x+8} 92 Q${x+4} 98 ${x} 100 Z`} fill={glow} opacity={0.6}/>
          ))}
        </>
      );
    case "crystals":
      return (
        <>
          {[[25,55],[60,40],[70,75],[35,85]].map(([x,y],i) => (
            <polygon key={i} points={`${x},${y-8} ${x+7},${y} ${x},${y+10} ${x-7},${y}`} fill={glow} opacity={0.6} stroke={accent} strokeWidth={0.6}/>
          ))}
        </>
      );
    case "leaves":
      return (
        <>
          {[[30,40],[65,55],[45,80]].map(([x,y],i) => (
            <path key={i} d={`M${x} ${y} Q${x+15} ${y-15} ${x+25} ${y} Q${x+15} ${y+8} ${x} ${y} Z`} fill={accent} opacity={0.5}/>
          ))}
        </>
      );
    case "waves":
      return (
        <>
          {[35,55,75,95].map((y,i) => (
            <path key={i} d={`M0 ${y} Q25 ${y-6} 50 ${y} T100 ${y}`} stroke={accent} strokeWidth={1.5} fill="none" opacity={0.55}/>
          ))}
        </>
      );
    case "nebula":
      return (
        <>
          <circle cx={35} cy={45} r={20} fill={glow} opacity={0.35}/>
          <circle cx={65} cy={70} r={16} fill={accent} opacity={0.35}/>
          {[[20,20],[80,30],[50,90],[75,55]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={1.5} fill="white" opacity={0.9}/>
          ))}
        </>
      );
    case "runes":
      return (
        <>
          <text x={50} y={55} fontSize={22} textAnchor="middle" fill={glow} opacity={0.7} fontFamily="serif">✦</text>
          <text x={30} y={85} fontSize={12} textAnchor="middle" fill={accent} opacity={0.7} fontFamily="serif">〄</text>
          <text x={70} y={85} fontSize={12} textAnchor="middle" fill={accent} opacity={0.7} fontFamily="serif">卐</text>
        </>
      );
    case "hearts":
      return (
        <>
          {[[30,45],[65,60],[45,85]].map(([x,y],i) => (
            <path key={i} d={`M${x} ${y+6} C${x-8} ${y-4} ${x-2} ${y-10} ${x} ${y-2} C${x+2} ${y-10} ${x+8} ${y-4} ${x} ${y+6} Z`} fill={glow} opacity={0.7}/>
          ))}
        </>
      );
    case "checker":
      return (
        <>
          {Array.from({length: 5}).flatMap((_,r) => Array.from({length: 5}).map((__,c) => (
            (r+c)%2===0 ? <rect key={`${r}-${c}`} x={c*20} y={20+r*18} width={20} height={18} fill={accent} opacity={0.35}/> : null
          )))}
        </>
      );
    case "zigzag":
      return (
        <>
          {[35,60,85].map((y,i) => (
            <polyline key={i} points={`0,${y} 15,${y-8} 30,${y} 45,${y-8} 60,${y} 75,${y-8} 90,${y} 100,${y-8}`} stroke={accent} strokeWidth={1.5} fill="none" opacity={0.55}/>
          ))}
        </>
      );
    default:
      return null;
  }
}

function starPoints(cx: number, cy: number, r: number, ri: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : ri;
    pts.push(`${cx + Math.cos(ang) * rr},${cy + Math.sin(ang) * rr}`);
  }
  return pts.join(" ");
}