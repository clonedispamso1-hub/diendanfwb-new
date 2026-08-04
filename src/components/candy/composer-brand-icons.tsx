/**
 * Brand-accurate composer icons for the "Tạo bài viết" toolbar.
 * Facebook, Zalo, Lucky Money (Lì xì) — each in a self-contained button so
 * the composer bar keeps a consistent square footprint but each icon looks
 * distinct, premium and instantly recognizable.
 */
import { useState } from "react";

interface BrandBtnProps {
  onClick: () => void;
  active?: boolean;
  title?: string;
  ariaLabel: string;
}

export function FacebookBrandButton({ onClick, active, title, ariaLabel }: BrandBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`brand-icon-btn brand-icon-btn--fb${active ? " is-active" : ""}`}
    >
      <svg viewBox="0 0 36 36" width="22" height="22" aria-hidden>
        <defs>
          <linearGradient id="fbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b8bff" />
            <stop offset="100%" stopColor="#0866ff" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="34" height="34" rx="9" fill="url(#fbGrad)" />
        <path
          d="M20.6 34V21.9h4.06l.61-4.72H20.6v-3.01c0-1.36.38-2.29 2.34-2.29h2.5V7.66c-.43-.06-1.92-.19-3.66-.19-3.62 0-6.1 2.21-6.1 6.27v3.43h-4.1v4.72h4.1V34h4.92z"
          fill="#fff"
        />
      </svg>
    </button>
  );
}

export function ZaloBrandButton({ onClick, active, title, ariaLabel }: BrandBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`brand-icon-btn brand-icon-btn--zalo${active ? " is-active" : ""}`}
    >
      <svg viewBox="0 0 36 36" width="22" height="22" aria-hidden>
        <defs>
          <linearGradient id="zaloGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e90ff" />
            <stop offset="100%" stopColor="#0068ff" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="34" height="34" rx="9" fill="url(#zaloGrad)" />
        <text
          x="18"
          y="24"
          textAnchor="middle"
          fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="900"
          fontSize="15"
          fill="#fff"
          letterSpacing="-0.5"
        >
          Zalo
        </text>
      </svg>
    </button>
  );
}

export function LuckyMoneyBrandButton({ onClick, active, title, ariaLabel }: BrandBtnProps) {
  const [sparkle, setSparkle] = useState(false);
  const handleClick = () => {
    setSparkle(true);
    window.setTimeout(() => setSparkle(false), 700);
    onClick();
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={ariaLabel}
      className={`brand-icon-btn brand-icon-btn--lucky${active ? " is-active" : ""}${sparkle ? " is-sparkle" : ""}`}
    >
      <svg viewBox="0 0 36 36" width="24" height="24" aria-hidden>
        <defs>
          <linearGradient id="lmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff4d4d" />
            <stop offset="55%" stopColor="#e11d1d" />
            <stop offset="100%" stopColor="#ff7a1a" />
          </linearGradient>
          <linearGradient id="lmShine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Envelope body */}
        <rect x="5" y="4" width="26" height="28" rx="4" fill="url(#lmGrad)" stroke="#facc15" strokeWidth="1.5" />
        {/* Highlight */}
        <rect x="6.5" y="5.5" width="23" height="10" rx="3" fill="url(#lmShine)" />
        {/* Gold coin medallion */}
        <circle cx="18" cy="20" r="6" fill="#fde047" stroke="#f59e0b" strokeWidth="1" />
        <text
          x="18"
          y="23.2"
          textAnchor="middle"
          fontFamily="'Times New Roman', serif"
          fontWeight="900"
          fontSize="8"
          fill="#b91c1c"
        >
          福
        </text>
        {/* Sparkles overlay */}
        <g className="lm-sparks" opacity="0.95">
          <circle cx="9" cy="8" r="0.9" fill="#fff7c2" />
          <circle cx="28" cy="10" r="0.9" fill="#fff7c2" />
          <circle cx="27" cy="27" r="0.9" fill="#fff7c2" />
          <circle cx="8" cy="26" r="0.9" fill="#fff7c2" />
        </g>
      </svg>
    </button>
  );
}