import { useId } from "react";

interface Zalo3DIconProps {
  className?: string;
}

export function Zalo3DIcon({ className }: Zalo3DIconProps) {
  const uid = useId().replace(/:/g, "");
  const shellId = `zalo-shell-${uid}`;
  const rimId = `zalo-rim-${uid}`;
  const glossId = `zalo-gloss-${uid}`;
  const shadowId = `zalo-shadow-${uid}`;

  return (
    <svg
      className={`zalo-3d-icon ${className ?? ""}`.trim()}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={shellId} x1="20" y1="12" x2="76" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38c8ff" />
          <stop offset="0.42" stopColor="#087cff" />
          <stop offset="1" stopColor="#0047bd" />
        </linearGradient>
        <linearGradient id={rimId} x1="25" y1="18" x2="69" y2="81" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dff8ff" />
          <stop offset="0.35" stopColor="#78d9ff" />
          <stop offset="0.72" stopColor="#0068e8" />
          <stop offset="1" stopColor="#003a9c" />
        </linearGradient>
        <linearGradient id={glossId} x1="35" y1="20" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.88" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={shadowId} x="-35%" y="-35%" width="170%" height="190%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#003d96" floodOpacity="0.46" />
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#74dcff" floodOpacity="0.7" />
        </filter>
      </defs>

      <ellipse cx="48" cy="85" rx="26" ry="6" fill="#003276" opacity="0.22" />
      <g filter={`url(#${shadowId})`}>
        <path
          d="M48 10c-21 0-36 14.6-36 34.1 0 16.4 10.6 29.3 26.9 33.2l7.8 8.1c1.6 1.7 4.5.6 4.5-1.8v-5.3C70.4 76.9 84 63 84 44.1 84 24.6 69 10 48 10Z"
          fill={`url(#${rimId})`}
        />
        <path
          d="M48 15.2c-18.2 0-30.8 12.3-30.8 28.9 0 14.4 9.7 25.3 24.7 28.4l4.2.9v5.4l2.6-2.7 1.4-1.5 2-.2c15.8-1.8 26.7-13.8 26.7-30.3 0-16.6-12.6-28.9-30.8-28.9Z"
          fill={`url(#${shellId})`}
        />
        <path
          d="M24.8 36.2c3.8-11 13.1-17.4 25.7-17.4 8.7 0 16 3.2 20.8 9-9.4-4.5-27.9-6.3-46.5 8.4Z"
          fill={`url(#${glossId})`}
        />
        <path
          d="M30 37.1h13.5v5.3l-7.1 9.7h7.4v5.8H29.6v-5.1l7.2-9.9H30v-5.8Zm20.4 5.6c5.1 0 8.7 3.2 8.7 7.8v7.4h-5.7v-1.8a7.3 7.3 0 0 1-5.2 2.3c-4 0-7.1-3.2-7.1-7.8 0-4.7 3.5-7.9 9.3-7.9Zm.2 5c-2.3 0-3.8 1.1-3.8 2.9s1.4 2.8 3.5 2.8c2 0 3.4-1 3.4-2.8s-1.2-2.9-3.1-2.9Zm10.9-11.9h5.8v22.1h-5.8V35.8Z"
          fill="#ffffff"
        />
        <path d="M27 65.7c11.8 7.1 31.6 6.5 43.6-5.8-5.2 10.4-15.8 14.4-28.8 11.7-6.2-1.3-11.2-3.2-14.8-5.9Z" fill="#003caa" opacity="0.32" />
      </g>
    </svg>
  );
}