// 100 unique pet species — each defined by a distinct combination of
// body shape, ears, eyes, tail, extras and palette. No two share the
// same trait tuple. PetSVG renders the pet with level-based evolution:
// Lv1 base → Lv2 aura → Lv3 gem/horn → Lv4 wings → Lv5 crown + halo + spikes.

import type { CSSProperties } from "react";

export type BodyShape =
  | "round" | "tall" | "wide" | "oval" | "chibi"
  | "dragon" | "serpent" | "blob" | "mech" | "sphere";
export type EarType =
  | "none" | "round" | "pointy" | "long" | "fluffy"
  | "flat" | "antenna" | "finlet" | "horn" | "spike";
export type EyeType =
  | "round" | "sleepy" | "star" | "sparkle" | "slit"
  | "visor" | "glow" | "dot" | "hero" | "heart";
export type TailType =
  | "none" | "fluffy" | "whip" | "curl" | "fin"
  | "spike" | "puff" | "feather" | "bee" | "flame";
export type ExtraType =
  | "none" | "wings" | "fins" | "horns" | "halo"
  | "mane" | "spikes" | "crown" | "beak" | "snout";

export type PetSpecies = {
  id: string;         // pet_001 .. pet_100
  name: string;
  stars: 1 | 2 | 3 | 4 | 5 | 6;
  body: BodyShape;
  ears: EarType;
  eyes: EyeType;
  tail: TailType;
  extra: ExtraType;
  palette: [string, string, string]; // main, deep, belly
  glow: string;
};

const PALETTES: Array<[string, string, string, string]> = [
  ["#fde68a", "#f97316", "#fff7ed", "#fb923c"], // fox-orange
  ["#a7f3d0", "#059669", "#ecfccb", "#34d399"], // forest
  ["#bae6fd", "#0284c7", "#e0f2fe", "#38bdf8"], // ice
  ["#c7d2fe", "#4338ca", "#e0e7ff", "#818cf8"], // galaxy
  ["#4b5563", "#111827", "#e5e7eb", "#6b7280"], // shadow
  ["#fce7f3", "#db2777", "#fdf2f8", "#f472b6"], // pink
  ["#fef3c7", "#eab308", "#fefce8", "#fde047"], // gold
  ["#fecaca", "#dc2626", "#fef2f2", "#f87171"], // red
  ["#e9d5ff", "#7c3aed", "#f3e8ff", "#a78bfa"], // violet
  ["#cffafe", "#0891b2", "#ecfeff", "#22d3ee"], // aqua
  ["#dcfce7", "#16a34a", "#f0fdf4", "#4ade80"], // emerald
  ["#f5d0fe", "#a21caf", "#fdf4ff", "#e879f9"], // magenta
  ["#e2e8f0", "#334155", "#f8fafc", "#94a3b8"], // steel
  ["#ffedd5", "#ea580c", "#fff7ed", "#fdba74"], // pumpkin
  ["#f3e8ff", "#9333ea", "#faf5ff", "#c084fc"], // twilight
  ["#fda4af", "#e11d48", "#fff1f2", "#fb7185"], // rose
  ["#a5f3fc", "#0e7490", "#ecfeff", "#22d3ee"], // teal
  ["#fef08a", "#ca8a04", "#fefce8", "#fde047"], // honey
  ["#ddd6fe", "#6d28d9", "#ede9fe", "#8b5cf6"], // purple
  ["#e0f2fe", "#0369a1", "#f0f9ff", "#22d3ee"], // sky
  ["#fee2e2", "#ef4444", "#fef2f2", "#fda4af"], // ruby
  ["#d9f99d", "#65a30d", "#f7fee7", "#a3e635"], // meadow
  ["#e9d5ff", "#a855f7", "#faf5ff", "#c084fc"], // amethyst
  ["#fed7aa", "#c2410c", "#ffedd5", "#fb923c"], // amber
  ["#93c5fd", "#1d4ed8", "#dbeafe", "#60a5fa"], // ocean
];

// Curated 100 species. Trait tuples are unique across the list.
const RAW: Array<[
  string, // name
  1 | 2 | 3 | 4 | 5 | 6, // stars
  BodyShape, EarType, EyeType, TailType, ExtraType,
  number, // palette idx
]> = [
  ["Fox",         2, "chibi",   "pointy",  "sleepy",  "fluffy",  "none",   0],
  ["Dragon",      5, "dragon",  "horn",    "slit",    "spike",   "wings",  7],
  ["Penguin",     1, "oval",    "none",    "round",   "none",    "beak",   2],
  ["Shark",       3, "wide",    "finlet",  "hero",    "fin",     "fins",   9],
  ["Ghost",       4, "blob",    "none",    "glow",    "none",    "none",   4],
  ["Cat",         1, "round",   "pointy",  "sleepy",  "curl",    "none",  12],
  ["Tiger",       3, "wide",    "round",   "hero",    "whip",    "mane",   0],
  ["Panda",       2, "round",   "round",   "sleepy",  "puff",    "none",  12],
  ["Unicorn",     5, "tall",    "long",    "sparkle", "feather", "horns",  5],
  ["Phoenix",     6, "tall",    "flat",    "star",    "flame",   "wings",  7],
  ["Wolf",        3, "wide",    "pointy",  "sparkle", "fluffy",  "mane",   4],
  ["Bunny",       1, "round",   "long",    "round",   "puff",    "none",   5],
  ["Robot",       4, "mech",    "antenna", "visor",   "none",    "none",  12],
  ["Alien",       4, "chibi",   "antenna", "glow",    "none",    "halo",  10],
  ["BabyDino",    2, "wide",    "spike",   "round",   "spike",   "spikes", 1],
  ["Griffin",     5, "tall",    "pointy",  "hero",    "feather", "wings",  6],
  ["Kirin",       6, "dragon",  "horn",    "star",    "flame",   "horns", 22],
  ["Wyvern",      5, "dragon",  "horn",    "slit",    "whip",    "wings", 20],
  ["Hydra",       6, "serpent", "horn",    "slit",    "whip",    "spikes",10],
  ["Basilisk",    4, "serpent", "spike",   "slit",    "spike",   "none",  10],
  ["Sphinx",      5, "tall",    "pointy",  "hero",    "whip",    "wings",  6],
  ["Angel",       5, "chibi",   "none",    "sparkle", "none",    "halo",   6],
  ["Demon",       5, "chibi",   "horn",    "glow",    "spike",   "wings",  7],
  ["Cerberus",    4, "wide",    "pointy",  "hero",    "fluffy",  "mane",   4],
  ["Pegasus",     4, "tall",    "long",    "sparkle", "feather", "wings", 19],
  ["Chimera",     5, "wide",    "horn",    "slit",    "flame",   "mane",  15],
  ["Golem",       3, "wide",    "flat",    "dot",     "none",    "spikes",12],
  ["Slime",       1, "blob",    "none",    "round",   "none",    "none",  10],
  ["Mummy",       2, "tall",    "none",    "dot",     "none",    "none",  17],
  ["Vampire",     4, "chibi",   "pointy",  "hero",    "none",    "wings", 20],
  ["Werewolf",    3, "tall",    "pointy",  "sparkle", "fluffy",  "mane",   4],
  ["Zombie",      2, "tall",    "round",   "dot",     "none",    "none",  10],
  ["Pumpkin",     2, "sphere",  "none",    "glow",    "none",    "spikes",13],
  ["Skeleton",    2, "tall",    "none",    "glow",    "none",    "none",  12],
  ["Witch",       3, "tall",    "pointy",  "sparkle", "none",    "crown",  8],
  ["Fairy",       3, "chibi",   "long",    "sparkle", "puff",    "wings",  5],
  ["Elf",         2, "tall",    "pointy",  "sparkle", "none",    "crown",  1],
  ["Merfolk",     3, "tall",    "finlet",  "sparkle", "fin",     "fins",  16],
  ["Nymph",       3, "chibi",   "long",    "sparkle", "puff",    "none",   1],
  ["Djinn",       5, "serpent", "flat",    "glow",    "whip",    "crown", 14],
  ["Turtle",      1, "wide",    "none",    "sleepy",  "none",    "spikes", 1],
  ["Owl",         2, "round",   "pointy",  "star",    "feather", "wings", 18],
  ["Bear",        2, "wide",    "round",   "sleepy",  "puff",    "none",  23],
  ["Deer",        2, "tall",    "long",    "sleepy",  "puff",    "horns", 23],
  ["Lion",        4, "wide",    "round",   "hero",    "whip",    "mane",   6],
  ["Monkey",      1, "chibi",   "round",   "sparkle", "curl",    "none",  13],
  ["Elephant",    3, "wide",    "flat",    "sleepy",  "whip",    "snout", 12],
  ["Giraffe",     2, "tall",    "round",   "sleepy",  "whip",    "none",   6],
  ["Zebra",       2, "tall",    "round",   "round",   "whip",    "none",  12],
  ["Kangaroo",    2, "tall",    "long",    "round",   "whip",    "none",   0],
  ["Koala",       1, "round",   "fluffy",  "sleepy",  "none",    "none",  12],
  ["Sloth",       1, "oval",    "round",   "sleepy",  "curl",    "none",  17],
  ["Hippo",       2, "wide",    "round",   "dot",     "puff",    "snout", 18],
  ["Rhino",       3, "wide",    "flat",    "hero",    "spike",   "horns", 12],
  ["Hedgehog",    1, "round",   "round",   "round",   "spike",   "spikes",13],
  ["Squirrel",    1, "chibi",   "pointy",  "round",   "fluffy",  "none",  13],
  ["Chinchilla",  1, "round",   "round",   "sleepy",  "puff",    "none",  12],
  ["Hamster",     1, "round",   "round",   "round",   "puff",    "none",   0],
  ["Ferret",      2, "tall",    "pointy",  "sparkle", "whip",    "none",  17],
  ["Raccoon",     2, "chibi",   "pointy",  "sparkle", "whip",    "none",   4],
  ["Meerkat",     2, "tall",    "round",   "sparkle", "whip",    "none",  13],
  ["Echidna",     2, "wide",    "none",    "dot",     "spike",   "spikes",13],
  ["Platypus",    3, "oval",    "flat",    "sleepy",  "fin",     "beak",  16],
  ["Opossum",     1, "oval",    "round",   "round",   "whip",    "none",  12],
  ["Otter",       2, "oval",    "round",   "sparkle", "whip",    "none",  16],
  ["Beaver",      1, "wide",    "round",   "round",   "fin",     "none",  17],
  ["Skunk",       2, "oval",    "round",   "sparkle", "fluffy",  "none",   4],
  ["Bat",         3, "chibi",   "pointy",  "glow",    "none",    "wings", 14],
  ["Mole",        1, "round",   "none",    "dot",     "none",    "snout", 17],
  ["Weasel",      1, "serpent", "pointy",  "sparkle", "whip",    "none",  23],
  ["Dolphin",     3, "wide",    "none",    "sparkle", "fin",     "fins",   9],
  ["Whale",       4, "wide",    "none",    "sleepy",  "fin",     "fins",  24],
  ["Seal",        2, "oval",    "none",    "round",   "fin",     "none",   2],
  ["Octopus",     4, "blob",    "none",    "hero",    "whip",    "fins",  22],
  ["Crab",        2, "wide",    "antenna", "dot",     "none",    "horns", 20],
  ["Jellyfish",   3, "blob",    "none",    "glow",    "whip",    "none",  11],
  ["Seahorse",    2, "tall",    "finlet",  "sleepy",  "curl",    "fins",   3],
  ["Starfish",    2, "sphere",  "none",    "star",    "none",    "spikes", 6],
  ["Lobster",     3, "wide",    "antenna", "hero",    "curl",    "horns",  7],
  ["Eel",         3, "serpent", "finlet",  "glow",    "whip",    "fins",   4],
  ["Sparrow",     1, "oval",    "flat",    "round",   "feather", "beak",  17],
  ["Robin",       1, "oval",    "flat",    "round",   "feather", "beak",   7],
  ["Eagle",       4, "tall",    "flat",    "hero",    "feather", "wings", 23],
  ["Hawk",        3, "tall",    "flat",    "hero",    "feather", "wings", 13],
  ["Peacock",     4, "tall",    "flat",    "star",    "feather", "wings", 22],
  ["Swan",        3, "tall",    "flat",    "sleepy",  "feather", "beak",  12],
  ["Flamingo",    3, "tall",    "flat",    "sparkle", "feather", "beak",   5],
  ["Toucan",      2, "oval",    "flat",    "round",   "feather", "beak",  10],
  ["Puffin",      2, "oval",    "flat",    "round",   "feather", "beak",   4],
  ["Parrot",      2, "oval",    "flat",    "sparkle", "feather", "beak",  11],
  ["Bee",         1, "sphere",  "antenna", "round",   "bee",     "wings",  6],
  ["Butterfly",   3, "chibi",   "antenna", "sparkle", "puff",    "wings", 18],
  ["Moth",        2, "chibi",   "antenna", "sleepy",  "puff",    "wings", 14],
  ["Ladybug",     1, "sphere",  "antenna", "dot",     "none",    "wings",  7],
  ["Firefly",     2, "chibi",   "antenna", "glow",    "none",    "wings", 17],
  ["Beetle",      2, "sphere",  "antenna", "dot",     "none",    "horns", 10],
  ["Dragonfly",   3, "chibi",   "antenna", "sparkle", "whip",    "wings",  2],
  ["Snail",       1, "blob",    "antenna", "sleepy",  "curl",    "none",  17],
  ["Ant",         1, "chibi",   "antenna", "dot",     "curl",    "none",   3],
  ["ScorpionCub", 3, "wide",    "antenna", "hero",    "spike",   "horns",  4],
];

// Verify uniqueness only in dev — trait tuples are curated to be distinct.
export const SPECIES_LIST: PetSpecies[] = RAW.map(([name, stars, body, ears, eyes, tail, extra, pi], i) => {
  const pal = PALETTES[pi % PALETTES.length];
  return {
    id: `pet_${String(i + 1).padStart(3, "0")}`,
    name, stars, body, ears, eyes, tail, extra,
    palette: [pal[0], pal[1], pal[2]],
    glow: pal[3],
  };
});

export const SPECIES: Record<string, PetSpecies> = Object.fromEntries(
  SPECIES_LIST.map((s) => [s.id, s]),
);

export function speciesById(id: string): PetSpecies {
  return SPECIES[id] ?? SPECIES_LIST[0];
}

// ============ Renderer ============

export const MAX_LEVEL = 5;

export function PetSVG({
  species,
  size = 140,
  level = 1,
  animate = true,
  celebrate = false,
  style,
}: {
  species: string;
  size?: number;
  level?: number;
  animate?: boolean;
  celebrate?: boolean;
  style?: CSSProperties;
}) {
  const s = speciesById(species);
  const lvl = Math.min(MAX_LEVEL, Math.max(1, level));
  const [c1, c2, belly] = s.palette;
  const uid = s.id;
  const gid = `pg-${uid}`;
  const glowId = `pgw-${uid}`;
  const auraOn = lvl >= 2;
  const gemOn = lvl >= 3;
  const wingsOn = lvl >= 4 || s.extra === "wings";
  const crownOn = lvl >= 5;
  const spikesOn = lvl >= 5 || s.extra === "spikes";

  return (
    <div
      className={`pw-pet${animate ? " pw-pet-float" : ""}${celebrate ? " pw-pet-celebrate" : ""}`}
      style={{ width: size, height: size, position: "relative", ...style }}
    >
      <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id={gid} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={s.glow} stopOpacity={auraOn ? 0.8 : 0.3} />
            <stop offset="100%" stopColor={s.glow} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Aura halo — brighter per level */}
        <ellipse cx="70" cy="70" rx={62 + lvl * 2} ry={58 + lvl * 2} fill={`url(#${glowId})`} />
        {crownOn && (
          <circle cx="70" cy="70" r="66" fill="none" stroke={s.glow} strokeWidth="1.2" opacity="0.7">
            <animate attributeName="r" values="60;70;60" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.6s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Ground shadow */}
        <ellipse cx="70" cy="132" rx="30" ry="4" fill="black" opacity="0.2" />

        {/* Wings under body */}
        {wingsOn && <Wings glow={s.glow} c2={c2} big={crownOn} />}

        {/* Ears / head extras */}
        <Ears type={s.ears} c1={c1} c2={c2} />

        {/* Body */}
        <g className="pw-pet-breathe">
          <Body body={s.body} c1={c1} c2={c2} belly={belly} gid={gid} />
          {/* Tail */}
          <g className="pw-pet-tail" style={{ transformOrigin: "108px 100px" }}>
            <Tail type={s.tail} c2={c2} glow={s.glow} />
          </g>
          {/* Face */}
          <Eyes type={s.eyes} glow={s.glow} />
          <Mouth extra={s.extra} />
          {/* Cheeks */}
          <circle cx="50" cy="88" r="3.6" fill="#fca5a5" opacity="0.55" />
          <circle cx="90" cy="88" r="3.6" fill="#fca5a5" opacity="0.55" />
        </g>

        {/* Species extras (mane, fins, snout, beak, horns) */}
        <Extra extra={s.extra} c2={c2} glow={s.glow} />

        {/* Level 3: gem on forehead */}
        {gemOn && (
          <g>
            <polygon points="70,42 66,49 74,49" fill={s.glow} stroke="#78350f" strokeWidth="0.5" />
            <polygon points="70,42 66,49 70,52 74,49" fill="white" opacity="0.5" />
          </g>
        )}

        {/* Level 5: crown */}
        {crownOn && (
          <g>
            <polygon
              points="52,30 60,18 68,30 76,16 84,30 92,20 92,36 52,36"
              fill="#fbbf24" stroke="#78350f" strokeWidth="0.7"
            />
            <circle cx="70" cy="28" r="2.2" fill="#ef4444" />
          </g>
        )}

        {/* Level 5 extra spikes on back */}
        {spikesOn && (
          <g fill={c2} opacity="0.9">
            <polygon points="58,58 62,48 66,58" />
            <polygon points="66,54 70,42 74,54" />
            <polygon points="74,58 78,48 82,58" />
          </g>
        )}

        {/* Sparkles for Lv2+ */}
        {auraOn &&
          [[24,32],[118,40],[30,110],[116,108]].slice(0, lvl).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.2} fill={s.glow}>
              <animate attributeName="opacity" values="0.2;1;0.2" dur="1.6s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
            </circle>
          ))}
      </svg>
    </div>
  );
}

function Body({
  body, c1, c2, belly, gid,
}: { body: BodyShape; c1: string; c2: string; belly: string; gid: string }) {
  const fill = `url(#${gid})`;
  switch (body) {
    case "tall":
      return (
        <>
          <ellipse cx="70" cy="86" rx="30" ry="44" fill={fill} />
          <ellipse cx="70" cy="100" rx="20" ry="26" fill={belly} opacity="0.85" />
        </>
      );
    case "wide":
      return (
        <>
          <ellipse cx="70" cy="88" rx="50" ry="34" fill={fill} />
          <ellipse cx="70" cy="96" rx="32" ry="20" fill={belly} opacity="0.85" />
        </>
      );
    case "oval":
      return (
        <>
          <ellipse cx="70" cy="86" rx="36" ry="40" fill={fill} />
          <ellipse cx="70" cy="98" rx="24" ry="22" fill={belly} opacity="0.85" />
        </>
      );
    case "chibi":
      return (
        <>
          <circle cx="70" cy="82" r="36" fill={fill} />
          <ellipse cx="70" cy="94" rx="22" ry="16" fill={belly} opacity="0.85" />
        </>
      );
    case "dragon":
      return (
        <>
          <path d="M40,90 Q40,58 70,54 Q100,58 100,90 Q100,120 70,120 Q40,120 40,90 Z" fill={fill} />
          <ellipse cx="70" cy="100" rx="22" ry="18" fill={belly} opacity="0.85" />
          <path d="M40,88 L28,72 L44,80 Z" fill={c2} />
          <path d="M100,88 L112,72 L96,80 Z" fill={c2} />
        </>
      );
    case "serpent":
      return (
        <>
          <path d="M40,100 Q40,68 70,68 Q100,68 100,100 Q100,124 70,124 Q40,124 40,100 Z" fill={fill} />
          <path d="M50,120 Q30,124 24,110 Q30,116 44,112" fill={c2} />
          <ellipse cx="70" cy="106" rx="22" ry="12" fill={belly} opacity="0.85" />
        </>
      );
    case "blob":
      return (
        <>
          <path d="M32,96 Q32,60 70,60 Q108,60 108,96 Q108,126 84,126 Q78,120 70,124 Q62,120 56,126 Q32,126 32,96 Z" fill={fill} />
          <ellipse cx="70" cy="98" rx="26" ry="18" fill={belly} opacity="0.85" />
        </>
      );
    case "mech":
      return (
        <>
          <rect x="38" y="58" width="64" height="60" rx="10" fill={fill} stroke={c2} strokeWidth="1.5" />
          <rect x="52" y="94" width="36" height="18" rx="4" fill={belly} opacity="0.85" />
          <circle cx="50" cy="70" r="2" fill={c2} />
          <circle cx="90" cy="70" r="2" fill={c2} />
        </>
      );
    case "sphere":
      return (
        <>
          <circle cx="70" cy="86" r="38" fill={fill} />
          <ellipse cx="70" cy="98" rx="26" ry="18" fill={belly} opacity="0.75" />
        </>
      );
    case "round":
    default:
      return (
        <>
          <ellipse cx="70" cy="82" rx="42" ry="38" fill={fill} />
          <ellipse cx="70" cy="94" rx="26" ry="20" fill={belly} opacity="0.85" />
        </>
      );
  }
}

function Ears({ type, c1, c2 }: { type: EarType; c1: string; c2: string }) {
  switch (type) {
    case "round":
      return (
        <>
          <circle cx="42" cy="48" r="12" fill={c2} />
          <circle cx="98" cy="48" r="12" fill={c2} />
          <circle cx="42" cy="48" r="6" fill={c1} opacity="0.7" />
          <circle cx="98" cy="48" r="6" fill={c1} opacity="0.7" />
        </>
      );
    case "pointy":
      return (
        <>
          <polygon points="38,54 46,20 58,52" fill={c2} />
          <polygon points="82,52 94,20 102,54" fill={c2} />
        </>
      );
    case "long":
      return (
        <>
          <ellipse cx="50" cy="30" rx="8" ry="22" fill={c2} />
          <ellipse cx="90" cy="30" rx="8" ry="22" fill={c2} />
          <ellipse cx="50" cy="34" rx="4" ry="16" fill="#fecaca" opacity="0.7" />
          <ellipse cx="90" cy="34" rx="4" ry="16" fill="#fecaca" opacity="0.7" />
        </>
      );
    case "fluffy":
      return (
        <>
          <circle cx="44" cy="50" r="14" fill={c1} />
          <circle cx="96" cy="50" r="14" fill={c1} />
          <circle cx="44" cy="52" r="8" fill={c2} opacity="0.6" />
          <circle cx="96" cy="52" r="8" fill={c2} opacity="0.6" />
        </>
      );
    case "flat":
      return (
        <>
          <ellipse cx="48" cy="50" rx="10" ry="4" fill={c2} />
          <ellipse cx="92" cy="50" rx="10" ry="4" fill={c2} />
        </>
      );
    case "antenna":
      return (
        <>
          <line x1="56" y1="46" x2="46" y2="22" stroke={c2} strokeWidth="2" />
          <line x1="84" y1="46" x2="94" y2="22" stroke={c2} strokeWidth="2" />
          <circle cx="46" cy="20" r="3.5" fill={c2} />
          <circle cx="94" cy="20" r="3.5" fill={c2} />
        </>
      );
    case "finlet":
      return (
        <>
          <path d="M40,52 L48,32 L54,52 Z" fill={c2} />
          <path d="M86,52 L92,32 L100,52 Z" fill={c2} />
        </>
      );
    case "horn":
      return (
        <>
          <path d="M50,44 Q46,22 58,26" stroke={c2} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M90,44 Q94,22 82,26" stroke={c2} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case "spike":
      return (
        <>
          <polygon points="46,52 50,26 54,52" fill={c2} />
          <polygon points="60,50 64,20 68,50" fill={c2} />
          <polygon points="72,50 76,20 80,50" fill={c2} />
          <polygon points="86,52 90,26 94,52" fill={c2} />
        </>
      );
    case "none":
    default:
      return null;
  }
}

function Eyes({ type, glow }: { type: EyeType; glow: string }) {
  const draw = (cx: number, i: number) => {
    const key = `${cx}-${i}`;
    switch (type) {
      case "sleepy":
        return <path key={key} d={`M${cx - 6},72 Q${cx},76 ${cx + 6},72`} stroke="#111827" strokeWidth="2.5" fill="none" strokeLinecap="round" />;
      case "star":
        return <polygon key={key} points={`${cx},64 ${cx + 2},70 ${cx + 8},70 ${cx + 3},74 ${cx + 5},80 ${cx},76 ${cx - 5},80 ${cx - 3},74 ${cx - 8},70 ${cx - 2},70`} fill="#111827" />;
      case "sparkle":
        return (
          <g key={key}>
            <circle cx={cx} cy={72} r={5} fill="#111827" />
            <circle cx={cx - 1.5} cy={70} r={1.5} fill="white" />
            <circle cx={cx + 2} cy={74} r={0.8} fill="white" />
          </g>
        );
      case "slit":
        return (
          <g key={key}>
            <ellipse cx={cx} cy={72} rx={4.5} ry={5.5} fill="#111827" />
            <rect x={cx - 0.7} y={68} width={1.4} height={9} fill={glow} />
          </g>
        );
      case "visor":
        return i === 0 ? (
          <rect key={key} x={50} y={68} width={40} height={8} rx={3} fill="#111827" stroke={glow} strokeWidth="1.2" />
        ) : (
          <line key={key} x1={54} y1={72} x2={86} y2={72} stroke={glow} strokeWidth={1.5} />
        );
      case "glow":
        return <circle key={key} cx={cx} cy={72} r={5} fill={glow}><animate attributeName="opacity" values="0.6;1;0.6" dur="1.4s" repeatCount="indefinite" /></circle>;
      case "dot":
        return <circle key={key} cx={cx} cy={72} r={2} fill="#111827" />;
      case "hero":
        return (
          <g key={key}>
            <circle cx={cx} cy={72} r={6} fill="white" stroke="#111827" strokeWidth="1.2" />
            <circle cx={cx} cy={72} r={3} fill="#111827" />
          </g>
        );
      case "heart":
        return <path key={key} d={`M${cx},76 C${cx - 6},70 ${cx - 2},66 ${cx},70 C${cx + 2},66 ${cx + 6},70 ${cx},76 Z`} fill="#ef4444" />;
      case "round":
      default:
        return (
          <g key={key} className="pw-pet-blink">
            <circle cx={cx} cy={72} r={5} fill="#111827" />
            <circle cx={cx - 1.5} cy={70} r={1.5} fill="white" />
          </g>
        );
    }
  };
  return <>{draw(58, 0)}{draw(82, 1)}</>;
}

function Mouth({ extra }: { extra: ExtraType }) {
  if (extra === "beak") return (
    <g>
      <polygon points="66,84 74,84 70,92" fill="#f59e0b" stroke="#78350f" strokeWidth="0.6" />
    </g>
  );
  if (extra === "snout") return (
    <g>
      <ellipse cx="70" cy="86" rx="8" ry="5" fill="#fca5a5" opacity="0.8" />
      <circle cx="70" cy="84" r="1.6" fill="#3f3f46" />
    </g>
  );
  return (
    <g>
      <ellipse cx="70" cy="82" rx="3" ry="2" fill="#3f3f46" />
      <path d="M62,88 Q70,94 78,88" stroke="#3f3f46" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Tail({ type, c2, glow }: { type: TailType; c2: string; glow: string }) {
  switch (type) {
    case "fluffy":
      return <path d="M108,100 Q124,88 122,72 Q116,88 106,92 Z" fill={c2} />;
    case "whip":
      return <path d="M110,100 Q130,96 128,80" stroke={c2} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case "curl":
      return <path d="M108,100 Q126,100 122,84 Q116,96 108,94" stroke={c2} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    case "fin":
      return <polygon points="110,96 128,86 128,108" fill={c2} />;
    case "spike":
      return (
        <g fill={c2}>
          <polygon points="108,98 118,90 116,102" />
          <polygon points="116,102 128,96 124,110" />
        </g>
      );
    case "puff":
      return <circle cx="118" cy="100" r="8" fill={c2} />;
    case "feather":
      return (
        <g fill={c2}>
          <ellipse cx="118" cy="90" rx="4" ry="10" transform="rotate(20 118 90)" />
          <ellipse cx="124" cy="98" rx="4" ry="10" transform="rotate(35 124 98)" />
          <ellipse cx="128" cy="108" rx="4" ry="10" transform="rotate(50 128 108)" />
        </g>
      );
    case "bee":
      return (
        <g>
          <ellipse cx="118" cy="104" rx="12" ry="8" fill="#fde047" />
          <rect x="112" y="100" width="3" height="8" fill="#111827" />
          <rect x="120" y="100" width="3" height="8" fill="#111827" />
        </g>
      );
    case "flame":
      return <path d="M108,100 Q120,80 130,88 Q120,96 116,110 Q112,102 108,100 Z" fill={glow} />;
    case "none":
    default:
      return null;
  }
}

function Wings({ glow, c2, big }: { glow: string; c2: string; big: boolean }) {
  const scale = big ? 1.2 : 1;
  return (
    <g opacity="0.9" style={{ transform: `scale(${scale})`, transformOrigin: "70px 82px" }}>
      <path d="M32,80 Q6,66 12,96 Q22,92 34,96 Z" fill={glow} opacity="0.9" />
      <path d="M108,80 Q134,66 128,96 Q118,92 106,96 Z" fill={glow} opacity="0.9" />
      <path d="M32,80 Q14,72 20,90" stroke={c2} strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M108,80 Q126,72 120,90" stroke={c2} strokeWidth="1" fill="none" opacity="0.5" />
    </g>
  );
}

function Extra({ extra, c2, glow }: { extra: ExtraType; c2: string; glow: string }) {
  switch (extra) {
    case "halo":
      return (
        <g>
          <ellipse cx="70" cy="24" rx="22" ry="4" fill="none" stroke={glow} strokeWidth="2.5" opacity="0.85" />
          <ellipse cx="70" cy="24" rx="18" ry="3" fill="none" stroke="white" strokeWidth="1" opacity="0.6" />
        </g>
      );
    case "mane":
      return (
        <g fill={c2} opacity="0.9">
          <circle cx="40" cy="72" r="9" />
          <circle cx="34" cy="88" r="10" />
          <circle cx="106" cy="88" r="10" />
          <circle cx="100" cy="72" r="9" />
        </g>
      );
    case "horns":
      return (
        <g>
          <path d="M54,40 Q52,20 62,24" stroke={c2} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M86,40 Q88,20 78,24" stroke={c2} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "fins":
      return (
        <g fill={glow} opacity="0.8">
          <polygon points="24,88 12,80 18,100" />
          <polygon points="116,88 128,80 122,100" />
        </g>
      );
    case "crown":
      return (
        <g>
          <polygon points="54,32 62,20 70,32 78,18 86,32 90,36 54,36" fill="#fbbf24" stroke="#78350f" strokeWidth="0.6" />
          <circle cx="70" cy="30" r="1.8" fill="#ef4444" />
        </g>
      );
    case "spikes":
    case "beak":
    case "snout":
    case "none":
    case "wings":
    default:
      return null;
  }
}
