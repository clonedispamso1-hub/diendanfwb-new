/**
 * IdentitySet — bộ nhận diện cá nhân (Crown + Pet + Flag).
 *
 * Được random cố định 1 lần khi tài khoản mới được tạo (trigger
 * `set_profile_identity_set` trên bảng `profiles`). Frontend chỉ ĐỌC —
 * không random client-side, không đổi khi F5/login/logout/đổi avatar.
 *
 * Style: SVG gradient + glow nhẹ, tone tím/hồng đồng bộ website.
 * Kích thước nhỏ gọn để đặt cạnh username mà không che avatar.
 */
import type { CSSProperties } from "react";

export type CrownVariant = "gold" | "silver" | "purple" | "blue" | "red" | "pink";
export type PetVariant =
  | "chick" | "cat" | "dog" | "rabbit" | "duck" | "fish" | "bird" | "fox" | "bear";
export type FlagVariant = "vn" | "vn_heart" | "vn_gold" | "vn_glow";

const CROWN_PALETTE: Record<CrownVariant, { from: string; to: string; stroke: string; glow: string }> = {
  gold:   { from: "#FFE27A", to: "#F5A524", stroke: "#B4740A", glow: "rgba(255,190,60,0.55)" },
  silver: { from: "#F3F5FA", to: "#B4BBCB", stroke: "#6B7285", glow: "rgba(200,210,230,0.55)" },
  purple: { from: "#D9B4FF", to: "#7A3BE0", stroke: "#4A1E90", glow: "rgba(160,80,255,0.55)" },
  blue:   { from: "#9BD3FF", to: "#2C6BE6", stroke: "#123F94", glow: "rgba(80,140,255,0.55)" },
  red:    { from: "#FF9E9E", to: "#E23744", stroke: "#8A1420", glow: "rgba(255,90,110,0.55)" },
  pink:   { from: "#FFC5E4", to: "#EC4899", stroke: "#9D1E62", glow: "rgba(236,100,180,0.55)" },
};

const PET_PALETTE: Record<PetVariant, { from: string; to: string; ring: string; glow: string }> = {
  chick:  { from: "#FFE86B", to: "#F5B301", ring: "rgba(255,196,50,0.35)", glow: "rgba(255,196,50,0.55)" },
  cat:    { from: "#FFD1A6", to: "#E27A3A", ring: "rgba(236,150,80,0.35)", glow: "rgba(236,150,80,0.5)" },
  dog:    { from: "#F0DCC0", to: "#A87445", ring: "rgba(190,140,80,0.35)", glow: "rgba(190,140,80,0.5)" },
  rabbit: { from: "#F6E6F5", to: "#C48BE8", ring: "rgba(196,139,232,0.35)", glow: "rgba(196,139,232,0.5)" },
  duck:   { from: "#FFF3A1", to: "#F0A800", ring: "rgba(240,168,0,0.35)", glow: "rgba(240,168,0,0.5)" },
  fish:   { from: "#B0EAFF", to: "#2E9DE0", ring: "rgba(46,157,224,0.35)", glow: "rgba(46,157,224,0.5)" },
  bird:   { from: "#B7E3FF", to: "#4A78E0", ring: "rgba(74,120,224,0.35)", glow: "rgba(74,120,224,0.5)" },
  fox:    { from: "#FFC894", to: "#E85D22", ring: "rgba(232,93,34,0.35)", glow: "rgba(232,93,34,0.5)" },
  bear:   { from: "#E4C4A0", to: "#7A4A26", ring: "rgba(122,74,38,0.35)", glow: "rgba(122,74,38,0.5)" },
};

const PET_LABEL: Record<PetVariant, string> = {
  chick: "Gà con", cat: "Mèo", dog: "Chó", rabbit: "Thỏ",
  duck: "Vịt", fish: "Cá", bird: "Chim", fox: "Cáo", bear: "Gấu",
};

const CROWN_LABEL: Record<CrownVariant, string> = {
  gold: "Vương miện Vàng", silver: "Vương miện Bạc", purple: "Vương miện Tím",
  blue: "Vương miện Xanh", red: "Vương miện Đỏ", pink: "Vương miện Hồng",
};

const FLAG_LABEL: Record<FlagVariant, string> = {
  vn: "Cờ Việt Nam", vn_heart: "Cờ VN — Trái tim",
  vn_gold: "Cờ VN — Viền vàng", vn_glow: "Cờ VN — Phát sáng",
};

/* -------------------- CROWN -------------------- */
export function CrownIcon({ variant, size = 20 }: { variant: CrownVariant; size?: number }) {
  const p = CROWN_PALETTE[variant];
  const id = `crown-${variant}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={CROWN_LABEL[variant]}
      role="img"
      style={{ filter: `drop-shadow(0 0 4px ${p.glow})` }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>
      {/* body */}
      <path
        d="M3 8.4c0-.7.8-1.1 1.4-.7l3.1 2 3.1-4.5c.6-.9 1.9-.9 2.5 0l3.1 4.5 3.1-2c.6-.4 1.4 0 1.4.7v6.6c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8.4Z"
        fill={`url(#${id})`}
        stroke={p.stroke}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* base */}
      <rect x="4.5" y="17.4" width="15" height="2.1" rx="1" fill={p.to} stroke={p.stroke} strokeWidth="0.9" />
      {/* jewels */}
      <circle cx="7" cy="12.5" r="1.1" fill="#fff" opacity="0.9" />
      <circle cx="12" cy="10.4" r="1.3" fill="#fff" opacity="0.95" />
      <circle cx="17" cy="12.5" r="1.1" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/* -------------------- PETS -------------------- */
function PetPaths({ variant }: { variant: PetVariant }) {
  // Each path draws a stylized pet head silhouette within 24×24.
  switch (variant) {
    case "chick":
      return (
        <>
          <circle cx="12" cy="13" r="6" />
          <path d="M18 13l3 1-3 1z" />
          <circle cx="14.4" cy="11.6" r="0.9" fill="#111" opacity="0.7" />
        </>
      );
    case "cat":
      return (
        <>
          <path d="M6 8l2 4H6zM18 8l-2 4h2z" />
          <circle cx="12" cy="14" r="5.5" />
          <circle cx="10.2" cy="13.4" r="0.7" fill="#111" opacity="0.7" />
          <circle cx="13.8" cy="13.4" r="0.7" fill="#111" opacity="0.7" />
        </>
      );
    case "dog":
      return (
        <>
          <path d="M6 8c-1 2-1 5 1 6l1-1z" />
          <path d="M18 8c1 2 1 5-1 6l-1-1z" />
          <ellipse cx="12" cy="14" rx="5.5" ry="5" />
          <ellipse cx="12" cy="16" rx="1.2" ry="0.9" fill="#111" opacity="0.75" />
        </>
      );
    case "rabbit":
      return (
        <>
          <ellipse cx="9.5" cy="7" rx="1.4" ry="3.5" />
          <ellipse cx="14.5" cy="7" rx="1.4" ry="3.5" />
          <circle cx="12" cy="15" r="5.5" />
          <circle cx="12" cy="16.5" r="0.9" fill="#111" opacity="0.7" />
        </>
      );
    case "duck":
      return (
        <>
          <circle cx="11" cy="13" r="5.5" />
          <path d="M16 13l4 0.5-4 2z" />
          <circle cx="12.2" cy="11.6" r="0.8" fill="#111" opacity="0.7" />
        </>
      );
    case "fish":
      return (
        <>
          <path d="M4 12c2-4 8-4 12 0-4 4-10 4-12 0Z" />
          <path d="M16 12l4-3v6z" />
          <circle cx="8" cy="11.4" r="0.8" fill="#111" opacity="0.7" />
        </>
      );
    case "bird":
      return (
        <>
          <circle cx="12" cy="12" r="5.5" />
          <path d="M17 12l3 0.5-3 1.5z" />
          <path d="M9 14l-2 3 3-1z" />
          <circle cx="13.4" cy="10.8" r="0.8" fill="#111" opacity="0.7" />
        </>
      );
    case "fox":
      return (
        <>
          <path d="M6 7l3 4-3 1zM18 7l-3 4 3 1z" />
          <path d="M6.5 12h11L12 20z" />
          <circle cx="10.4" cy="13.6" r="0.7" fill="#111" opacity="0.75" />
          <circle cx="13.6" cy="13.6" r="0.7" fill="#111" opacity="0.75" />
        </>
      );
    case "bear":
      return (
        <>
          <circle cx="7.5" cy="9" r="2" />
          <circle cx="16.5" cy="9" r="2" />
          <circle cx="12" cy="14" r="5.5" />
          <ellipse cx="12" cy="16" rx="1.3" ry="0.9" fill="#111" opacity="0.75" />
        </>
      );
  }
}

export function PetIcon({ variant, size = 20 }: { variant: PetVariant; size?: number }) {
  const p = PET_PALETTE[variant];
  const id = `pet-${variant}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={PET_LABEL[variant]}
      role="img"
      style={{ filter: `drop-shadow(0 0 3px ${p.glow})` }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${id})`} opacity="0.16" />
      <circle cx="12" cy="12" r="11" fill="none" stroke={p.ring} strokeWidth="1" />
      <g fill={`url(#${id})`} stroke={p.ring} strokeWidth="0.8" strokeLinejoin="round">
        <PetPaths variant={variant} />
      </g>
    </svg>
  );
}

/* -------------------- FLAG (Việt Nam) -------------------- */
export function FlagIcon({ variant, size = 20 }: { variant: FlagVariant; size?: number }) {
  const w = size * 1.35;
  const h = size;
  const showStar = true;
  const border =
    variant === "vn_gold" ? "#F5B301"
    : variant === "vn_glow" ? "#F87171"
    : variant === "vn_heart" ? "#EC4899"
    : "rgba(0,0,0,0.15)";
  const glow =
    variant === "vn_glow" ? "0 0 8px rgba(248,113,113,0.75)"
    : variant === "vn_gold" ? "0 0 6px rgba(245,179,1,0.6)"
    : variant === "vn_heart" ? "0 0 4px rgba(236,72,153,0.5)"
    : "0 1px 2px rgba(0,0,0,0.15)";
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 30 22"
      fill="none"
      aria-label={FLAG_LABEL[variant]}
      role="img"
      style={{ filter: `drop-shadow(${glow})`, display: "inline-block" }}
    >
      <rect x="1" y="1" width="28" height="20" rx="3" fill="#DA251D" stroke={border} strokeWidth="1.4" />
      {showStar ? (
        <path
          d="M15 5.6l1.6 4.9h5.1l-4.1 3 1.6 4.9L15 15.4l-4.2 3 1.6-4.9-4.1-3h5.1z"
          fill="#FFE85F"
          stroke={variant === "vn_gold" ? "#B4740A" : "none"}
          strokeWidth="0.4"
        />
      ) : null}
      {variant === "vn_heart" ? (
        <path
          d="M24.5 3.8c-.7-.7-1.9-.7-2.6 0l-.3.3-.3-.3c-.7-.7-1.9-.7-2.6 0-.7.7-.7 1.9 0 2.6l2.9 2.9 2.9-2.9c.7-.7.7-1.9 0-2.6Z"
          fill="#EC4899"
          opacity="0.85"
        />
      ) : null}
    </svg>
  );
}

/* -------------------- WRAPPER -------------------- */
export interface IdentitySetProps {
  crown?: CrownVariant | string | null;
  pet?: PetVariant | string | null;
  flag?: FlagVariant | string | null;
  /** Kích thước base — mặc định 18px cho hàng bên cạnh tên. */
  size?: number;
  /** Khoảng cách giữa các icon. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}

const isCrown = (v?: string | null): v is CrownVariant =>
  !!v && ["gold","silver","purple","blue","red","pink"].includes(v);
const isPet = (v?: string | null): v is PetVariant =>
  !!v && ["chick","cat","dog","rabbit","duck","fish","bird","fox","bear"].includes(v);
const isFlag = (v?: string | null): v is FlagVariant =>
  !!v && ["vn","vn_heart","vn_gold","vn_glow"].includes(v);

/**
 * Hiển thị Crown + Pet + Flag inline. Bỏ qua bất kỳ icon nào không có
 * variant hợp lệ (tài khoản cũ chưa backfill).
 */
export function IdentitySet({
  crown, pet, flag, size = 18, gap = 4, className = "", style,
}: IdentitySetProps) {
  // Pet icons are intentionally hidden — the app now shows only Crown + Flag.
  void pet;
  const hasAny = isCrown(crown) || isFlag(flag);
  if (!hasAny) return null;
  return (
    <span
      className={`identity-set ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        verticalAlign: "middle",
        ...style,
      }}
    >
      {isCrown(crown) ? <CrownIcon variant={crown} size={size} /> : null}
      {isFlag(flag)   ? <FlagIcon  variant={flag}  size={size} /> : null}
    </span>
  );
}

export default IdentitySet;
