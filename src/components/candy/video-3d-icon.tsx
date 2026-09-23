export function Video3DIcon() {
  return (
    <svg className="video-3d-icon" viewBox="0 0 96 96" role="img" aria-hidden="true">
      <defs>
        <linearGradient
          id="video-body"
          x1="18"
          y1="30"
          x2="73"
          y2="79"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="0.52" stopColor="hsl(var(--accent))" />
          <stop offset="1" stopColor="hsl(var(--primary) / 0.72)" />
        </linearGradient>
        <linearGradient
          id="video-top"
          x1="20"
          y1="15"
          x2="76"
          y2="45"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(var(--background))" />
          <stop offset="0.22" stopColor="hsl(var(--primary) / 0.9)" />
          <stop offset="0.45" stopColor="hsl(var(--foreground))" />
          <stop offset="0.68" stopColor="hsl(var(--primary) / 0.9)" />
          <stop offset="1" stopColor="hsl(var(--background))" />
        </linearGradient>
        <linearGradient
          id="video-edge"
          x1="27"
          y1="72"
          x2="74"
          y2="87"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(var(--foreground) / 0.78)" />
          <stop offset="1" stopColor="hsl(var(--primary) / 0.48)" />
        </linearGradient>
        <filter id="video-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse className="video-3d-icon__shadow" cx="49" cy="82" rx="27" ry="7" />
      <g filter="url(#video-glow)">
        <path d="M19 41.5 72 35l6 8.5-53.5 7.2Z" fill="hsl(var(--primary) / 0.24)" />
      </g>
      <path
        d="M20 40.5 74 34v11.5L20 52Z"
        fill="url(#video-top)"
        stroke="hsl(var(--foreground) / 0.78)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M20 52 74 45.5v28L67 81 27 84l-7-6.5Z"
        fill="url(#video-body)"
        stroke="hsl(var(--foreground) / 0.82)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M27 84 67 81l7-7.5V79l-6.2 7-39.5 3L20 82.5v-5Z"
        fill="url(#video-edge)"
        opacity="0.9"
      />
      <path
        d="m43 59 16 8-16 10Z"
        fill="hsl(var(--background))"
        stroke="hsl(var(--background) / 0.68)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m25 39 9.5-1.2-7 11-7.5.9Z" fill="hsl(var(--background) / 0.92)" />
      <path d="m45 36.6 9.5-1.2-7 11-9.5 1.2Z" fill="hsl(var(--background) / 0.92)" />
      <path d="m65 34.2 9-1.1v10.2l-2 1.2-9 1.1Z" fill="hsl(var(--background) / 0.92)" />
      <path
        d="M27 56.5 67 52"
        stroke="hsl(var(--background) / 0.42)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="30" cy="72" r="2.2" fill="hsl(var(--background) / 0.75)" />
      <path
        d="M23 34.5 70 20l4 12.8-54 7.7Z"
        fill="url(#video-top)"
        stroke="hsl(var(--foreground) / 0.82)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="m29 32.7 9-2.7-5.8 8.1-8.5 1.2Z" fill="hsl(var(--background) / 0.94)" />
      <path d="m48 27.3 9-2.6-6.1 10-9 1.3Z" fill="hsl(var(--background) / 0.94)" />
      <path d="m66 22.1 4-1.2 3.7 11.9-13.3 1.9Z" fill="hsl(var(--background) / 0.94)" />
      <path
        d="M25.5 57.5 65 53"
        stroke="hsl(var(--background) / 0.62)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
