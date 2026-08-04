/**
 * Badge glyph set — 100% vector SVG, game/MMORPG style.
 *
 * Nguyên tắc vẽ (product-locked):
 *   • Silhouette đặc (fill), KHÔNG dùng nét mảnh kiểu line-icon.
 *   • Luôn có viền tối (outline) → tách khỏi nền, nhìn rõ ở 22px.
 *   • Có highlight sáng phía trên → cảm giác 3D nhẹ.
 *   • Glow nằm ở CSS (::before, phía SAU icon) — không phủ lên icon.
 *
 * Mọi glyph vẽ trên viewBox 24x24 và tô bằng `currentColor`,
 * nên đổi màu badge chỉ cần đổi `--ub-rgb`.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

const OUTLINE = {
  stroke: "rgb(8 12 26 / 0.72)",
  strokeWidth: 1.15,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

/** Thân badge: fill currentColor + viền tối. */
function Body({ d }: { d: string }) {
  return <path d={d} fill="currentColor" {...OUTLINE} />;
}

/** Mảng sáng 3D phía trên. */
function Shine({ d, o = 0.42 }: { d: string; o?: number }) {
  return <path d={d} fill="#ffffff" fillOpacity={o} />;
}

/** Mảng tối tạo chiều sâu. */
function Shade({ d, o = 0.3 }: { d: string; o?: number }) {
  return <path d={d} fill="#050914" fillOpacity={o} />;
}

/** Chi tiết nét (mắt, râu, vân...). */
function Ink({ d, w = 1.5 }: { d: string; w?: number }) {
  return (
    <path
      d={d}
      stroke="rgb(6 10 22 / 0.9)"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function Eyes({ x1 = 9.4, x2 = 14.6, y = 12.2, r = 1.05 }) {
  return (
    <>
      <circle cx={x1} cy={y} r={r} fill="#0a0f1f" />
      <circle cx={x2} cy={y} r={r} fill="#0a0f1f" />
      <circle cx={x1 - 0.3} cy={y - 0.35} r={r * 0.34} fill="#ffffff" fillOpacity={0.9} />
      <circle cx={x2 - 0.3} cy={y - 0.35} r={r * 0.34} fill="#ffffff" fillOpacity={0.9} />
    </>
  );
}

/* ==================================================================== */
/*  MYTHIC                                                              */
/* ==================================================================== */

export const GlyphDragon = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M4.2 15.4c-.5-3.6 1.1-6.9 4-8.6l-.9-3.1 3.1 1.7c1.3-.4 2.6-.4 3.9 0l3.1-1.7-.9 3.1c2.4 1.4 3.9 3.9 4 6.6l1.9 1.3-2.4.9c-.9 2.6-3.5 4.5-7.2 4.5-4.3 0-8-2.2-8.6-4.7z" />
    <Shine d="M8.4 6.9c1.9-1.1 4.2-1.4 6.3-.8l-.6 1.6c-1.9-.6-3.9-.4-5.4.5z" o={0.5} />
    <Shade d="M12.6 19.9c3.4-.2 5.8-2 6.7-4.4l2.1-.8-1.9-1.3c.1 3.6-2.5 6-6.9 6.5z" />
    <Ink d="M9.6 16.9c1.6.9 3.6.9 5.2 0" w={1.3} />
    <Eyes y={12.4} x1={9.6} x2={14.4} />
    <Ink d="M7.2 4.1 6 1.9M16.8 4.1 18 1.9" w={1.3} />
  </svg>
);

export const GlyphPhoenix = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.2c1.5 1.6 2.1 3.4 1.6 5.2 1.7-1.4 3.8-1.6 5.9-.6-.7 2.1-2 3.6-3.7 4.6 2 .3 3.5 1.4 4.4 3.2-2.3 1.1-4.4 1.2-6.3.5l.6 6.7-2.5-2-2.5 2 .6-6.7c-1.9.7-4 .6-6.3-.5.9-1.8 2.4-2.9 4.4-3.2C6.5 10.4 5.2 8.9 4.5 6.8c2.1-1 4.2-.8 5.9.6C9.9 5.6 10.5 3.8 12 2.2z" />
    <Shine d="M12 2.2c1.1 1.2 1.7 2.5 1.7 3.9l-1.7.9-1.7-.9c0-1.4.6-2.7 1.7-3.9z" o={0.45} />
    <Shade d="m12.5 12.1.6 6.7-1.1-.9z" o={0.28} />
    <Ink d="M12 11.4v4.2" w={1.2} />
  </svg>
);

export const GlyphUnicorn = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12.9 2.1 11.4 7c-3.4.6-5.9 3.4-5.9 7v5.9H8v-3.6l2.1 1.4h4.6c2.9 0 5.1-2.2 5.1-5 0-2.3-1.4-4.2-3.5-4.9l1.2-2.7-2.9 1.9c-.4-.1-.8-.2-1.2-.2z" />
    <Shine d="M12.9 2.1 11.4 7l1.4.3z" o={0.55} />
    <Shine d="M6.4 13.1c.5-2.4 2.3-4.2 4.7-4.8l.3 1.5c-1.9.5-3.3 1.8-3.7 3.6z" o={0.35} />
    <Shade d="M14.7 17.3c2.9 0 5.1-2.2 5.1-5 0-1.2-.4-2.3-1.1-3.2.3.7.5 1.5.5 2.3 0 2.8-2.2 5-5.1 5z" />
    <Eyes x1={13.5} x2={16.4} y={11.6} r={0.95} />
  </svg>
);

export const GlyphAngel = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 6.6a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z" />
    <Body d="M9.4 13.3C6 13.6 3.4 15.9 2.3 19.9c3-1.2 5.4-1.5 7.1-.9zM14.6 13.3c3.4.3 6 2.6 7.1 6.6-3-1.2-5.4-1.5-7.1-.9z" />
    <path
      d="M12 2.6c2.5 0 4.5.8 4.5 1.8S14.5 6.2 12 6.2 7.5 5.4 7.5 4.4 9.5 2.6 12 2.6z"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    />
    <Shine d="M9.9 7.6a3.3 3.3 0 0 1 4.2 0c-1.3-.7-2.9-.7-4.2 0z" o={0.5} />
    <Shine d="M9.4 13.3C7 13.5 5 14.8 3.6 17c1.5-1.7 3.4-2.6 5.8-2.8z" o={0.35} />
  </svg>
);

export const GlyphDemon = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M4.6 3.3c2.6.6 4.2 2.1 4.9 4.4l-2 .9C7.1 6.7 6.1 5.4 4.6 4.6zM19.4 3.3c-2.6.6-4.2 2.1-4.9 4.4l2 .9c.4-1.9 1.4-3.2 2.9-4z" />
    <Body d="M12 7.1c4.2 0 7.2 2 7.2 5s-3.2 8.8-7.2 8.8S4.8 15.1 4.8 12.1s3-5 7.2-5z" />
    <Shine d="M12 7.1c-3 0-5.4 1-6.5 2.7C6.9 8.7 9.2 8 12 8s5.1.7 6.5 1.8C17.4 8.1 15 7.1 12 7.1z" o={0.4} />
    <Shade d="M12 20.9c4 0 7.2-5.8 7.2-8.8 0-1-.4-1.9-1-2.6.2.6.3 1.2.3 1.9 0 3-2.7 8.2-6.5 9.5z" />
    <Eyes y={12.2} r={1.15} />
    <Ink d="M9.2 16.2c1.8 1.2 3.8 1.2 5.6 0" w={1.4} />
  </svg>
);

export const GlyphSkull = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.6c4.5 0 7.6 3.1 7.6 7.3 0 2.2-.9 3.9-2.4 5v3.4c0 1.7-1.2 2.6-3 2.6h-4.4c-1.8 0-3-.9-3-2.6v-3.4c-1.5-1.1-2.4-2.8-2.4-5 0-4.2 3.1-7.3 7.6-7.3z" />
    <Shine d="M12 2.6c-3.6 0-6.4 2-7.3 5 1.4-2.3 4-3.7 7.3-3.7s5.9 1.4 7.3 3.7c-.9-3-3.7-5-7.3-5z" o={0.45} />
    <circle cx="9.1" cy="10.4" r="2.1" fill="#080d1c" />
    <circle cx="14.9" cy="10.4" r="2.1" fill="#080d1c" />
    <path d="M12 13.4l1.1 2.2h-2.2z" fill="#080d1c" />
    <Ink d="M9.6 17.6v3.2M12 17.6v3.2M14.4 17.6v3.2" w={1.1} />
  </svg>
);

export const GlyphAlien = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.4c4.9 0 8.2 3.4 8.2 7.7 0 5-4.2 11.4-8.2 11.4S3.8 15.1 3.8 10.1c0-4.3 3.3-7.7 8.2-7.7z" />
    <Shine d="M12 2.4c-4 0-7 2.3-7.9 5.5C5.3 5.4 8.2 3.7 12 3.7s6.7 1.7 7.9 4.2C19 4.7 16 2.4 12 2.4z" o={0.4} />
    <path d="M8.9 9.3c1.8.1 3.1 1.3 3.1 2.8 0 .9-.8 1.4-1.8 1.1-1.6-.4-2.9-1.7-2.9-2.9 0-.7.7-1.1 1.6-1z" fill="#080d1c" />
    <path d="M15.1 9.3c-1.8.1-3.1 1.3-3.1 2.8 0 .9.8 1.4 1.8 1.1 1.6-.4 2.9-1.7 2.9-2.9 0-.7-.7-1.1-1.6-1z" fill="#080d1c" />
    <Ink d="M10.6 17.4c.9.5 1.9.5 2.8 0" w={1.2} />
  </svg>
);

export const GlyphGhost = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.4c4.2 0 7 3 7 7.2v11.3l-2.3-1.8-2.3 1.8-2.4-1.8-2.4 1.8-2.3-1.8L5 20.9V9.6c0-4.2 2.8-7.2 7-7.2z" />
    <Shine d="M12 2.4C8.6 2.4 6 4.4 5.3 7.5 6.4 5.2 8.8 3.8 12 3.8s5.6 1.4 6.7 3.7C18 4.4 15.4 2.4 12 2.4z" o={0.42} />
    <Shade d="M19 9.6v11.3l-2.3-1.8 1-.9V9.6c0-2.4-.9-4.4-2.5-5.6 2.3 1 3.8 3.1 3.8 5.6z" o={0.26} />
    <Eyes y={10.2} x1={9.5} x2={14.5} r={1.15} />
    <Ink d="M11 13.8c.6.6 1.4.6 2 0" w={1.2} />
  </svg>
);

/* ==================================================================== */
/*  BEASTS                                                              */
/* ==================================================================== */

export const GlyphFox = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M3.1 3.2 8 8.4c2.5-.9 5.5-.9 8 0l4.9-5.2.4 6.4c.5 4.1-1.6 7.6-5.1 9.5L12 21.2l-4.2-2.1C4.3 17.2 2.2 13.7 2.7 9.6z" />
    <Shine d="M3.1 3.2 8 8.4l-1.2 1L3.4 5.8z" o={0.45} />
    <Shade d="M20.9 3.2 16 8.4l1.2 1 3.4-3.6z" o={0.35} />
    <path d="M12 13.3c1.9 0 3.4 1 3.4 2 0 1.4-1.7 2.9-3.4 2.9s-3.4-1.5-3.4-2.9c0-1 1.5-2 3.4-2z" fill="#ffffff" fillOpacity={0.55} />
    <Eyes y={11.8} x1={9} x2={15} r={1.1} />
    <circle cx="12" cy="15.2" r="1" fill="#0a0f1f" />
  </svg>
);

export const GlyphWolf = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M3.4 2.6 7.6 7.6h8.8l4.2-5 .5 7.1c.3 4-1.7 7.1-5.3 8.9L12 21.4l-3.8-2.8C4.6 16.8 2.6 13.7 2.9 9.7z" />
    <Shine d="M3.4 2.6 7.6 7.6 6.4 8.5 3.7 5.3z" o={0.45} />
    <path d="M12 12.6c2.1 0 3.7 1.1 3.7 2.4 0 1.9-1.8 3.7-3.7 3.7s-3.7-1.8-3.7-3.7c0-1.3 1.6-2.4 3.7-2.4z" fill="#0a0f1f" fillOpacity={0.28} />
    <Eyes y={11.4} x1={8.9} x2={15.1} r={1.1} />
    <path d="M12 14.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z" fill="#0a0f1f" />
    <Ink d="M10.2 18.2 12 17l1.8 1.2" w={1.2} />
  </svg>
);

export const GlyphLion = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="m12 1.6 1.9 1.9 2.6-.8.6 2.7 2.7.6-.8 2.6 1.9 1.9-1.9 1.9.8 2.6-2.7.6-.6 2.7-2.6-.8L12 21.9l-1.9-1.9-2.6.8-.6-2.7-2.7-.6.8-2.6L3.1 13 5 11.1l-.8-2.6 2.7-.6.6-2.7 2.6.8z" />
    <Shine d="m12 1.6 1.9 1.9-1.9.8-1.9-.8z" o={0.5} />
    <circle cx="12" cy="12" r="4.9" fill="#ffffff" fillOpacity={0.32} stroke="rgb(8 12 26 / 0.7)" strokeWidth={1.05} />
    <Eyes y={11.2} x1={10.2} x2={13.8} r={0.95} />
    <path d="M12 13.3 13.1 15h-2.2z" fill="#0a0f1f" />
    <Ink d="M10.4 16.2c1 .7 2.2.7 3.2 0" w={1.2} />
  </svg>
);

export const GlyphTiger = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M4.6 3.6 8 7.4c2.5-1 5.4-1 7.9 0l3.5-3.8.5 5.7c1 4.7-1.7 9-5.9 10.9L12 21l-2-.8C5.8 18.3 3.1 14 4.1 9.3z" />
    <Shine d="M4.6 3.6 8 7.4 6.8 8.3 4.9 6.2z" o={0.4} />
    <path d="M12 13.4c2 0 3.5 1.1 3.5 2.3 0 1.7-1.7 3.3-3.5 3.3s-3.5-1.6-3.5-3.3c0-1.2 1.5-2.3 3.5-2.3z" fill="#ffffff" fillOpacity={0.5} />
    <Ink d="M6.5 9.5 8 11M17.5 9.5 16 11M7 13l1.4.6M17 13l-1.4.6" w={1.4} />
    <Eyes y={11.6} x1={9.2} x2={14.8} r={1.1} />
    <path d="M12 15a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="#0a0f1f" />
  </svg>
);

export const GlyphPanther = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M5.2 4.1 8.4 7.6c2.3-.8 4.9-.8 7.2 0l3.2-3.5.6 5.4c.7 4.6-2 8.7-6.1 10.4l-1.3.6-1.3-.6C6.6 18.2 3.9 14.1 4.6 9.5z" />
    <Shade d="M18.8 4.1 15.6 7.6l1.2 1 2-2.2z" o={0.4} />
    <Shine d="M5.2 4.1 8.4 7.6l-1.2 1-2-2.2z" o={0.35} />
    <Eyes y={11.9} x1={9.3} x2={14.7} r={1.15} />
    <path d="M12 14.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z" fill="#0a0f1f" />
    <Ink d="M10 18.1c1.3.7 2.7.7 4 0" w={1.2} />
  </svg>
);

export const GlyphCat = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M4.4 3.8 7.6 8c2.8-1.1 6-1.1 8.8 0l3.2-4.2.7 6.4c.4 4.4-2.7 8.2-7 9.4l-1.3.4-1.3-.4c-4.3-1.2-7.4-5-7-9.4z" />
    <Shine d="M4.4 3.8 7.6 8 6.4 8.9 4.7 6.5z" o={0.45} />
    <path d="M12 14.1c1.7 0 3 .9 3 1.9 0 1.4-1.4 2.7-3 2.7s-3-1.3-3-2.7c0-1 1.3-1.9 3-1.9z" fill="#ffffff" fillOpacity={0.45} />
    <Eyes y={11.9} x1={9.2} x2={14.8} r={1.15} />
    <Ink d="M4.5 13.5 7.6 14M19.5 13.5 16.4 14M5 16.3l2.7-.9M19 16.3l-2.7-.9" w={1.1} />
    <path d="M12 15.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" fill="#0a0f1f" />
  </svg>
);

export const GlyphBear = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M6.4 3.9a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2zM17.6 3.9a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2z" />
    <Body d="M12 5.6c4.4 0 7.6 3.2 7.6 7.4S16.4 21 12 21s-7.6-3.8-7.6-8 3.2-7.4 7.6-7.4z" />
    <Shine d="M12 5.6c-3.6 0-6.4 2.1-7.3 5.2C6 8.4 8.6 6.9 12 6.9s6 1.5 7.3 3.9c-.9-3.1-3.7-5.2-7.3-5.2z" o={0.4} />
    <path d="M12 13.6c2 0 3.6 1.2 3.6 2.6 0 1.6-1.6 2.9-3.6 2.9s-3.6-1.3-3.6-2.9c0-1.4 1.6-2.6 3.6-2.6z" fill="#ffffff" fillOpacity={0.42} />
    <Eyes y={11.6} x1={9.4} x2={14.6} r={1.05} />
    <path d="M12 14.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z" fill="#0a0f1f" />
  </svg>
);

export const GlyphDeer = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M4.4 1.6 6.9 5l2.2-1.1-.4 3 1.4 1.7-1.9 1.2L6.4 8 3.6 8.6l1.1-2.4-2.2-1.9 2.6-.3zM19.6 1.6 17.1 5l-2.2-1.1.4 3-1.4 1.7 1.9 1.2L17.6 8l2.8.6-1.1-2.4 2.2-1.9-2.6-.3z" />
    <Body d="M12 8.2c2.9 0 5 2 5 4.7 0 3.4-2.4 8-5 8s-5-4.6-5-8c0-2.7 2.1-4.7 5-4.7z" />
    <Shine d="M12 8.2c-2.4 0-4.3 1.4-4.9 3.4.9-1.5 2.7-2.4 4.9-2.4s4 .9 4.9 2.4c-.6-2-2.5-3.4-4.9-3.4z" o={0.42} />
    <Eyes y={12.4} x1={10} x2={14} r={1} />
    <path d="M12 15.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="#0a0f1f" />
  </svg>
);

/* ==================================================================== */
/*  BIRDS                                                               */
/* ==================================================================== */

export const GlyphEagle = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 4.1c1.9 0 3.4 1.3 3.4 3.1l3.1-.7-1.9 2.4 4.3 1.4-4.3 2.1 2.6 2.2-4.3.2-1.2 2.9-1.7-2-1.7 2-1.2-2.9-4.3-.2 2.6-2.2L3.1 10.3l4.3-1.4L5.5 6.5l3.1.7c0-1.8 1.5-3.1 3.4-3.1z" />
    <Shine d="M12 4.1c-1.5 0-2.7.8-3.2 2 .7-.9 1.8-1.4 3.2-1.4s2.5.5 3.2 1.4c-.5-1.2-1.7-2-3.2-2z" o={0.45} />
    <path d="m12 16.4 1.6 2.2L12 21.6l-1.6-3z" fill="currentColor" {...OUTLINE} />
    <Eyes y={7.6} x1={10.5} x2={13.5} r={0.85} />
    <path d="m12 9 1.6 1.8L12 12.5l-1.6-1.7z" fill="#0a0f1f" fillOpacity={0.75} />
  </svg>
);

export const GlyphOwl = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="m5.2 2.8 3 2.6c2.4-1.1 5.2-1.1 7.6 0l3-2.6-.5 4.5c1 1.4 1.6 3.1 1.6 5 0 5-3.9 8.9-7.9 8.9S4.1 17.3 4.1 12.3c0-1.9.6-3.6 1.6-5z" />
    <Shine d="M12 4.6c-2.6 0-4.8 1-6.2 2.7l-.6-4.5 3 2.6c1.2-.5 2.5-.8 3.8-.8z" o={0.35} />
    <circle cx="9" cy="11.2" r="2.9" fill="#ffffff" fillOpacity={0.6} stroke="rgb(8 12 26 / 0.7)" strokeWidth={1} />
    <circle cx="15" cy="11.2" r="2.9" fill="#ffffff" fillOpacity={0.6} stroke="rgb(8 12 26 / 0.7)" strokeWidth={1} />
    <circle cx="9" cy="11.2" r="1.25" fill="#0a0f1f" />
    <circle cx="15" cy="11.2" r="1.25" fill="#0a0f1f" />
    <path d="m12 13.6 1.4 2.1h-2.8z" fill="#0a0f1f" />
    <Ink d="M8.6 18.4c2.2 1 4.6 1 6.8 0" w={1.2} />
  </svg>
);

export const GlyphSwan = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M15.6 2.4c2.1 0 3.6 1.6 3.6 3.7 0 1.4-.7 2.4-2.1 3.4-1.7 1.2-2.5 2.3-2.9 4.2 3.1.2 5.1 1.3 6.3 3.2-2.3 2.6-5.6 4-9.4 4-4.1 0-7.4-2.2-7.4-5.4 0-2.9 2.2-4.7 5.2-5.7 3-1 4.2-1.9 4.2-3.7V6c0-2.1 1.5-3.6 2.5-3.6z" />
    <Shine d="M15.6 2.4c-1 0-2.5 1.5-2.5 3.6v.3c.3-1.8 1.5-3 2.9-3 1.5 0 2.6.9 3 2.3-.3-1.9-1.7-3.2-3.4-3.2z" o={0.45} />
    <path d="m19.4 4.4 3.2 1.4-3.2 1.5z" fill="#0a0f1f" fillOpacity={0.7} />
    <circle cx="17.1" cy="4.6" r=".95" fill="#0a0f1f" />
  </svg>
);

/* ==================================================================== */
/*  BUGS                                                                */
/* ==================================================================== */

export const GlyphButterfly = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M11.2 12 4.9 3.6C2.9 2.6 1.4 3.6 1.4 5.8c0 2.1 1 4 2.6 5.1-1.9.8-3 2.2-3 4 0 2.4 1.7 3.9 3.9 3.9 2.9 0 5.4-2.1 6.3-5.1zM12.8 12l6.3-8.4c2-1 3.5 0 3.5 2.2 0 2.1-1 4-2.6 5.1 1.9.8 3 2.2 3 4 0 2.4-1.7 3.9-3.9 3.9-2.9 0-5.4-2.1-6.3-5.1z" />
    <Shine d="M4.9 3.6C3.5 2.9 2.3 3.3 1.7 4.6c.9-.8 2-.9 3.2-.3l5.3 7.1z" o={0.4} />
    <Body d="M12 6.6c.8 0 1.4.7 1.4 1.6v9.4c0 1-.6 1.8-1.4 1.8s-1.4-.8-1.4-1.8V8.2c0-.9.6-1.6 1.4-1.6z" />
    <Ink d="M12 6.4 10.2 3.4M12 6.4 13.8 3.4" w={1.2} />
  </svg>
);

export const GlyphBee = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 6.4c3.1 0 5.4 2.5 5.4 6.2s-2.3 8-5.4 8-5.4-4.3-5.4-8 2.3-6.2 5.4-6.2z" />
    <path d="M7.1 11.2h9.8M6.9 14.4h10.2M8.1 17.6h7.8" stroke="#0a0f1f" strokeOpacity={0.82} strokeWidth={1.7} strokeLinecap="round" />
    <path d="M11.3 5.6C9.8 2.9 7 1.7 4.2 2.9c-1.5.7-1.4 2.5.2 3.6 1.6 1.2 4.2 1.6 6.9 1.1zM12.7 5.6C14.2 2.9 17 1.7 19.8 2.9c1.5.7 1.4 2.5-.2 3.6-1.6 1.2-4.2 1.6-6.9 1.1z" fill="#ffffff" fillOpacity={0.55} stroke="rgb(8 12 26 / 0.6)" strokeWidth={1} strokeLinejoin="round" />
    <Eyes y={9.4} x1={10.2} x2={13.8} r={0.85} />
  </svg>
);

export const GlyphScorpion = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M11 9.5c1.6 0 2.8 1.2 2.8 2.9v3.1c0 1.9-1.3 3.3-3 3.3s-3-1.4-3-3.3v-3.1c0-1.7 1.4-2.9 3.2-2.9z" />
    <Body d="M13.6 12.1c1.4-3.4 3.4-5 5.8-4.5 1.8.4 2.6 2 2 3.8-.5 1.5-1.7 2.5-3.2 2.8l1.4 1.6-3.1-.4-.7 2.3-1.6-2.4z" />
    <Body d="M8.2 9.6C6.5 7.3 4.6 6.5 2.6 7.2l1.6 1.9-2.5 1.1 2.6 1.2-.4 2z" />
    <Shine d="M11 9.5c-1.5 0-2.7.9-3.1 2.2.6-1 1.7-1.5 3.1-1.5s2.5.5 3.1 1.5c-.4-1.3-1.6-2.2-3.1-2.2z" o={0.4} />
    <Eyes x1={9.6} x2={12.2} y={12.2} r={0.85} />
  </svg>
);

/* ==================================================================== */
/*  SEA                                                                 */
/* ==================================================================== */

export const GlyphShark = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M10.6 2.4c1.1 2.6 1.6 4.9 1.6 6.9 3.4.3 6 1.5 7.8 3.6l2.6-1.2-1.2 2.9 1.2 2.9-2.9-1.1c-1.9 2.3-4.9 3.6-8.9 3.6-4.6 0-8-2.1-9.3-5.6 2-.7 3.9-1.2 5.6-1.4-.9-1.7-1.2-3.4-.9-5.1 1.3.6 2.4 1.4 3.3 2.4.1-2.7.5-5 1.1-7.9z" />
    <Shine d="M10.6 2.4c-.6 2.9-1 5.2-1.1 7.9l1.3.9c-.1-3 .2-5.6.9-8.2z" o={0.4} />
    <path d="M12.6 15.6c2.6 0 4.9.5 6.9 1.4-1.9 1.7-4.5 2.6-7.7 2.6-3.4 0-6.1-1.1-7.8-3.1 2.7-.6 5.5-.9 8.6-.9z" fill="#ffffff" fillOpacity={0.5} />
    <Eyes x1={9.4} x2={13.4} y={12.4} r={0.85} />
  </svg>
);

export const GlyphOctopus = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.4c4.2 0 7 2.9 7 6.7 0 2.1-.8 3.8-2.2 5H7.2C5.8 12.9 5 11.2 5 9.1c0-3.8 2.8-6.7 7-6.7z" />
    <Body d="M7.3 13.6c-.4 3-1.6 5-3.6 6 .1-2.2-.4-3.9-1.5-5.1zM16.7 13.6c.4 3 1.6 5 3.6 6-.1-2.2.4-3.9 1.5-5.1zM10.4 13.9c-.9 3.2-1.6 5.5-2.1 7-1.1-1.9-1.3-4.2-.6-7zM13.6 13.9c.9 3.2 1.6 5.5 2.1 7 1.1-1.9 1.3-4.2.6-7zM12 14c1.1 2.6 1.6 5 1.4 7.4-1-.7-1.9-.7-2.8 0-.2-2.4.3-4.8 1.4-7.4z" />
    <Shine d="M12 2.4C8.5 2.4 6 4.5 5.3 7.5 6.5 5.2 8.9 3.8 12 3.8s5.5 1.4 6.7 3.7C18 4.5 15.5 2.4 12 2.4z" o={0.4} />
    <Eyes y={8.8} x1={9.6} x2={14.4} r={1.25} />
  </svg>
);

export const GlyphCrab = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 7.6c3.6 0 6.4 2.2 6.4 5s-2.8 4.8-6.4 4.8-6.4-2-6.4-4.8 2.8-5 6.4-5z" />
    <Body d="M5.4 8.4C3.1 8.6 1.6 7.4 1.6 5.4l2.1 1.2-.6-2.5 2.4 1.6 1.4 1.3zM18.6 8.4c2.3.2 3.8-1 3.8-3l-2.1 1.2.6-2.5-2.4 1.6-1.4 1.3z" />
    <Shine d="M12 7.6c-2.9 0-5.2 1.4-6.1 3.4 1.2-1.5 3.4-2.4 6.1-2.4s4.9.9 6.1 2.4c-.9-2-3.2-3.4-6.1-3.4z" o={0.4} />
    <Ink d="M7.4 17.8 5.9 20.4M10 18.4l-.6 2.6M14 18.4l.6 2.6M16.6 17.8l1.5 2.6" w={1.3} />
    <Eyes y={10.6} x1={9.6} x2={14.4} r={1.05} />
    <Ink d="M10 14.2c1.3.8 2.7.8 4 0" w={1.3} />
  </svg>
);

/* ==================================================================== */
/*  TECH / WARRIORS                                                     */
/* ==================================================================== */

export const GlyphRobot = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 1.4c.8 0 1.4.6 1.4 1.4 0 .6-.3 1-.8 1.3v1.3h3.6c2.4 0 4.2 1.8 4.2 4.2v6c0 2.4-1.8 4.2-4.2 4.2H7.8c-2.4 0-4.2-1.8-4.2-4.2v-6c0-2.4 1.8-4.2 4.2-4.2h3.6V4.1c-.5-.3-.8-.7-.8-1.3 0-.8.6-1.4 1.4-1.4z" />
    <Shine d="M16.2 5.4H7.8c-2.1 0-3.8 1.4-4.1 3.4.6-1.6 2.2-2.6 4.1-2.6h8.4c1.9 0 3.5 1 4.1 2.6-.3-2-2-3.4-4.1-3.4z" o={0.4} />
    <rect x="6.4" y="8.6" width="11.2" height="6" rx="1.8" fill="#0a0f1f" fillOpacity={0.82} />
    <circle cx="9.4" cy="11.6" r="1.4" fill="#ffffff" fillOpacity={0.9} />
    <circle cx="14.6" cy="11.6" r="1.4" fill="#ffffff" fillOpacity={0.9} />
    <Ink d="M9 17.6h6M3.4 11h-1.6M20.6 11h1.6" w={1.5} />
  </svg>
);

export const GlyphNinja = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M12 2.4c4.5 0 7.6 3.1 7.6 7.6 0 5.4-3.4 11-7.6 11S4.4 15.4 4.4 10c0-4.5 3.1-7.6 7.6-7.6z" />
    <Shine d="M12 2.4C8.4 2.4 5.7 4.4 4.8 7.5 6.1 5.2 8.7 3.8 12 3.8s5.9 1.4 7.2 3.7c-.9-3.1-3.6-5.1-7.2-5.1z" o={0.38} />
    <path d="M4.7 8.4h14.6c.2.7.3 1.5.3 2.3H4.4c0-.8.1-1.6.3-2.3z" fill="#ffffff" fillOpacity={0.72} />
    <circle cx="9.4" cy="9.6" r="1.05" fill="#0a0f1f" />
    <circle cx="14.6" cy="9.6" r="1.05" fill="#0a0f1f" />
    <path d="M18.6 8.6 22.4 6l-1 4.4z" fill="currentColor" {...OUTLINE} />
  </svg>
);

export const GlyphSamurai = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M2.6 7.2C5 4.4 8.3 3 12 3s7 1.4 9.4 4.2l-3.1 1.4.7 2.2H6l.7-2.2z" />
    <Body d="M6.6 11.2h10.8v3.2c0 3.4-2.4 6.2-5.4 6.2s-5.4-2.8-5.4-6.2z" />
    <Shine d="M12 3C8.7 3 5.8 4.1 3.5 6.3 5.8 4.7 8.6 3.8 12 3.8s6.2.9 8.5 2.5C18.2 4.1 15.3 3 12 3z" o={0.42} />
    <path d="M7.6 12.8h8.8v2.2H7.6z" fill="#0a0f1f" fillOpacity={0.8} />
    <circle cx="9.8" cy="13.9" r=".85" fill="#ffffff" fillOpacity={0.9} />
    <circle cx="14.2" cy="13.9" r=".85" fill="#ffffff" fillOpacity={0.9} />
    <Ink d="M12 16.4v3.4M9.6 17.4l1 2M14.4 17.4l-1 2" w={1.2} />
  </svg>
);

export const GlyphFlame = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M13.4 1.6c.5 3 .1 5.3-1.2 6.9 1.7.1 3-.6 3.9-2.1 2.5 2.4 3.8 5 3.8 7.6 0 4.4-3.5 7.6-7.9 7.6s-7.9-3.2-7.9-7.6c0-3.5 2.1-7 6.3-10.4-.3 2.1.2 3.6 1.4 4.7.4-2.8 1.2-5 2.6-6.7z" />
    <path d="M12 11.6c1.9 2 2.9 3.8 2.9 5.3 0 1.9-1.3 3.1-2.9 3.1s-2.9-1.2-2.9-3.1c0-1.5 1-3.3 2.9-5.3z" fill="#ffffff" fillOpacity={0.6} />
    <Shine d="M13.4 1.6c-1.4 1.7-2.2 3.9-2.6 6.7l1.2.7c.2-2.9.7-5.4 1.4-7.4z" o={0.35} />
  </svg>
);

export const GlyphThunder = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M14.6 1.4 5.4 12.6h4.7l-1.1 10 9.8-11.8h-5.1z" />
    <Shine d="M14.6 1.4 5.4 12.6h1.9l8.6-10.5z" o={0.5} />
    <Shade d="m18.8 10.8-9.8 11.8.3-2.7 7.8-9.1z" o={0.3} />
  </svg>
);

export const GlyphKitsune = (p: P) => (
  <svg {...SVG} {...p}>
    <Body d="M3.2 2.6 7.9 8c2.6-1 5.6-1 8.2 0l4.7-5.4.4 6.6c.3 4.3-2.1 7.9-6 9.6L12 20.4l-3.2-1.6c-3.9-1.7-6.3-5.3-6-9.6z" />
    <Shine d="M3.2 2.6 7.9 8 6.6 9 3.6 5.6z" o={0.4} />
    <path d="M12 12.6c2 0 3.6 1.1 3.6 2.3 0 1.7-1.7 3.3-3.6 3.3s-3.6-1.6-3.6-3.3c0-1.2 1.6-2.3 3.6-2.3z" fill="#ffffff" fillOpacity={0.55} />
    <path d="M6.6 11.2c1-1 2-1.5 3-1.5s2 .5 3 1.5c-1 .6-2 .9-3 .9s-2-.3-3-.9zM11.4 11.2c1-1 2-1.5 3-1.5s2 .5 3 1.5c-1 .6-2 .9-3 .9s-2-.3-3-.9z" fill="#0a0f1f" fillOpacity={0.85} />
    <path d="M12 14.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="#0a0f1f" />
  </svg>
);

/* ==================================================================== */
/*  SPECIAL — Crown (admin) / Tick (clone VIP) / Medal (top)            */
/* ==================================================================== */

export const GlyphCrown3D = (p: P) => (
  <svg {...SVG} {...p}>
    <defs>
      <linearGradient id="ubCrownG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff6c2" />
        <stop offset="45%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <path
      d="M2.6 8.2 6.9 11l3.4-5.6a2 2 0 1 1 3.4 0L17.1 11l4.3-2.8-1.7 9.4c-.2 1.1-1 1.7-2.2 1.7H6.5c-1.2 0-2-.6-2.2-1.7z"
      fill="url(#ubCrownG)"
      stroke="rgb(69 26 3 / 0.85)"
      strokeWidth={1.1}
      strokeLinejoin="round"
    />
    <path d="M4.6 15.2h14.8l-.3 1.8H4.9z" fill="#78350f" fillOpacity={0.45} />
    <path d="M2.6 8.2 6.9 11l.7-1.1-3.6-2.3zM21.4 8.2 17.1 11l-.7-1.1 3.6-2.3z" fill="#fff8d6" fillOpacity={0.7} />
    <circle cx="12" cy="4.1" r="1.15" fill="#fff7cf" stroke="rgb(69 26 3 / 0.7)" strokeWidth={0.9} />
    <circle cx="2.9" cy="7.6" r="1.15" fill="#fde68a" stroke="rgb(69 26 3 / 0.7)" strokeWidth={0.9} />
    <circle cx="21.1" cy="7.6" r="1.15" fill="#fde68a" stroke="rgb(69 26 3 / 0.7)" strokeWidth={0.9} />
  </svg>
);

export const GlyphTick = (p: P) => (
  <svg {...SVG} {...p}>
    <defs>
      <linearGradient id="ubTickG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7dd3fc" />
        <stop offset="55%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="9.6" fill="url(#ubTickG)" stroke="rgb(3 41 71 / 0.8)" strokeWidth={1.1} />
    <path d="M12 2.4c-4.4 0-8 3-9.3 6.9C4.4 6.4 7.8 4.4 12 4.4s7.6 2 9.3 4.9C20 5.4 16.4 2.4 12 2.4z" fill="#ffffff" fillOpacity={0.3} />
    <path
      d="m7.4 12.3 3.1 3.1 6.1-6.6"
      stroke="#ffffff"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const GlyphMedal = (p: P) => (
  <svg {...SVG} {...p}>
    {/* Ribbons */}
    <path
      d="M7.6 2.2h3.1L12.6 7 9.6 8.3zM16.4 2.2h-3.1L11.4 7l3 1.3z"
      fill="currentColor"
      fillOpacity={0.55}
      stroke="rgb(8 12 26 / 0.55)"
      strokeWidth={0.9}
      strokeLinejoin="round"
    />
    {/* Medallion */}
    <circle cx="12" cy="15" r="6.7" fill="currentColor" stroke="rgb(8 12 26 / 0.6)" strokeWidth={1.05} />
    <circle cx="12" cy="15" r="4.9" fill="#ffffff" fillOpacity={0.16} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.8} />
    {/* Star */}
    <path
      d="m12 11.3 1.05 2.16 2.38.33-1.72 1.66.41 2.36L12 16.7l-2.12 1.11.41-2.36-1.72-1.66 2.38-.33z"
      fill="#ffffff"
      fillOpacity={0.92}
    />
    {/* Top gloss */}
    <path d="M12 8.6c-2.9 0-5.4 1.7-6.4 4.2C6.9 11.2 9.2 10 12 10s5.1 1.2 6.4 2.8C17.4 10.3 14.9 8.6 12 8.6z" fill="#ffffff" fillOpacity={0.28} />
  </svg>
);

/**
 * GlyphCrest — huy hiệu thành viên thống nhất toàn site.
 * Khiên vector nhiều mặt cắt, tô bằng `currentColor` (màu riêng từng badge),
 * highlight trắng tạo chiều sâu. Gọn, nét, cân bằng ở mọi kích thước.
 */
export const GlyphCrest = (p: P) => (
  <svg {...SVG} {...p}>
    <path
      d="M12 2.3 19.4 5v6.6c0 4.1-3 7.4-7.4 10.1-4.4-2.7-7.4-6-7.4-10.1V5z"
      fill="currentColor"
      stroke="rgb(8 12 26 / 0.65)"
      strokeWidth={1.1}
      strokeLinejoin="round"
    />
    <path d="M12 2.3 19.4 5v3.1L12 5.4 4.6 8.1V5z" fill="#ffffff" fillOpacity={0.34} />
    <path d="M12 21.7c4.4-2.7 7.4-6 7.4-10.1V9.4c-.9 4.6-3.4 8.3-7.4 11z" fill="#050914" fillOpacity={0.22} />
    <path
      d="m12 8 1.35 2.78 3.05.42-2.2 2.14.52 3.04L12 14.94 9.28 16.38l.52-3.04-2.2-2.14 3.05-.42z"
      fill="#ffffff"
      fillOpacity={0.9}
    />
  </svg>
);

/**
 * GlyphSprout — mầm cây xanh: huy hiệu mặc định của thành viên thường.
 * Nhỏ gọn, nét, đọc rõ ở 14–16px; tô bằng `currentColor` (xanh lá).
 */
export const GlyphSprout = (p: P) => (
  <svg {...SVG} {...p}>
    {/* thân mầm */}
    <path
      d="M12 21.2v-7.4"
      stroke="rgb(8 12 26 / 0.55)"
      strokeWidth={1.9}
      strokeLinecap="round"
    />
    <path d="M12 21v-7.2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    {/* lá trái */}
    <path
      d="M11.6 14.2c-3.6.5-6-1.3-6.4-4.6 3.4-.9 6 .9 6.4 4.6z"
      fill="currentColor"
      stroke="rgb(8 12 26 / 0.6)"
      strokeWidth={1}
      strokeLinejoin="round"
    />
    <path d="M11.2 13.6c-2-1.6-3.6-2.5-5.4-3" stroke="#050914" strokeOpacity={0.28} strokeWidth={0.9} strokeLinecap="round" />
    {/* lá phải */}
    <path
      d="M12.4 13.4c-.4-4.2 1.9-6.9 6-7.2.5 4.2-1.8 6.9-6 7.2z"
      fill="currentColor"
      stroke="rgb(8 12 26 / 0.6)"
      strokeWidth={1}
      strokeLinejoin="round"
    />
    <path d="M13 12.6c1.9-2.2 3.3-3.6 5-4.6" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={0.9} strokeLinecap="round" />
  </svg>
);



/* ==================================================================== */

export const BADGE_GLYPHS = {
  dragon: GlyphDragon,
  phoenix: GlyphPhoenix,
  unicorn: GlyphUnicorn,
  angel: GlyphAngel,
  demon: GlyphDemon,
  skull: GlyphSkull,
  alien: GlyphAlien,
  ghost: GlyphGhost,
  fox: GlyphFox,
  kitsune: GlyphKitsune,
  wolf: GlyphWolf,
  lion: GlyphLion,
  tiger: GlyphTiger,
  panther: GlyphPanther,
  cat: GlyphCat,
  bear: GlyphBear,
  deer: GlyphDeer,
  eagle: GlyphEagle,
  owl: GlyphOwl,
  swan: GlyphSwan,
  butterfly: GlyphButterfly,
  bee: GlyphBee,
  scorpion: GlyphScorpion,
  shark: GlyphShark,
  octopus: GlyphOctopus,
  crab: GlyphCrab,
  robot: GlyphRobot,
  ninja: GlyphNinja,
  samurai: GlyphSamurai,
  flame: GlyphFlame,
  thunder: GlyphThunder,
} as const;

export type BadgeGlyphKey = keyof typeof BADGE_GLYPHS;
