export function Posts3DIcon() {
  return (
    <svg className="posts-3d-icon" viewBox="0 0 96 96" role="img" aria-hidden="true">
      <defs>
        <linearGradient
          id="posts-body"
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
          id="posts-top"
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
          id="posts-edge"
          x1="27"
          y1="72"
          x2="74"
          y2="87"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="hsl(var(--foreground) / 0.78)" />
          <stop offset="1" stopColor="hsl(var(--primary) / 0.48)" />
        </linearGradient>
        <filter id="posts-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse className="posts-3d-icon__shadow" cx="49" cy="82" rx="27" ry="7" />
      <g filter="url(#posts-glow)">
        <path d="M18 48 74 42l6 8.5-53.5 7.2Z" fill="hsl(var(--primary) / 0.24)" />
      </g>

      {/* Back page layer (thickness) */}
      <path d="M24 55 78 49v32L72 84 28 87l-4-4Z" fill="url(#posts-edge)" opacity="0.9" />

      {/* Main front page */}
      <path
        d="M20 52 74 45.5v32L67 81 27 84l-7-6.5Z"
        fill="url(#posts-body)"
        stroke="hsl(var(--foreground) / 0.82)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Top fold / header */}
      <path
        d="M20 40.5 74 34v11.5L20 52Z"
        fill="url(#posts-top)"
        stroke="hsl(var(--foreground) / 0.78)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Folded corner */}
      <path
        d="M67 81 74 77.5V81l-6.2 7Z"
        fill="hsl(var(--background) / 0.9)"
        stroke="hsl(var(--foreground) / 0.6)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Newspaper text lines */}
      <g stroke="hsl(var(--background) / 0.85)" strokeWidth="2.4" strokeLinecap="round">
        <line x1="30" y1="58" x2="64" y2="54" />
        <line x1="30" y1="64" x2="60" y2="61" />
        <line x1="30" y1="70" x2="58" y2="67" />
        <line x1="30" y1="76" x2="50" y2="74" />
      </g>

      {/* Small image placeholder in newspaper */}
      <rect
        x="52"
        y="62"
        width="12"
        height="12"
        rx="2"
        fill="hsl(var(--background) / 0.55)"
        stroke="hsl(var(--background) / 0.75)"
        strokeWidth="1.2"
      />

      {/* Header highlight line */}
      <path
        d="M27 56.5 67 52"
        stroke="hsl(var(--background) / 0.42)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Top sheet with folded edge detail */}
      <path
        d="M23 34.5 70 20l4 12.8-54 7.7Z"
        fill="url(#posts-top)"
        stroke="hsl(var(--foreground) / 0.82)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Decorative fold strips on top sheet */}
      <path d="m29 32.7 9-2.7-5.8 8.1-8.5 1.2Z" fill="hsl(var(--background) / 0.94)" />
      <path d="m48 27.3 9-2.6-6.1 10-9 1.3Z" fill="hsl(var(--background) / 0.94)" />
      <path d="m66 22.1 4-1.2 3.7 11.9-13.3 1.9Z" fill="hsl(var(--background) / 0.94)" />

      {/* Accent line */}
      <path
        d="M25.5 57.5 65 53"
        stroke="hsl(var(--background) / 0.62)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
