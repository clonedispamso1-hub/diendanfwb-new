import { useId } from "react";

interface ChatShareIconProps {
  className?: string;
}

export function PingFlameIcon({ className }: ChatShareIconProps) {
  const id = useId().replace(/:/g, "");
  const outer = `${id}-outer`;
  const inner = `${id}-inner`;

  return (
    <svg className={className} viewBox="0 0 42 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={outer} x1="8" y1="4" x2="34" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ping-flame-gold)" />
          <stop offset="0.43" stopColor="var(--ping-flame-coral)" />
          <stop offset="1" stopColor="var(--ping-flame-rose)" />
        </linearGradient>
        <linearGradient id={inner} x1="18" y1="22" x2="25" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ping-flame-core)" />
          <stop offset="1" stopColor="var(--ping-flame-gold)" />
        </linearGradient>
      </defs>
      <path
        d="M23.9 2.8c1.4 7.2-3.6 10.6-7.1 15-2.6 3.1-3.2 6.3-1.8 9.2.9-3.5 3.6-5.8 6.3-8-.3 4.3 2.6 6.8 5.1 9.3 2 2 2.9 4.7 2.1 7.5 3.3-2.6 5-6.7 4.2-10.7 6.5 5.7 6 15.3-.8 19.7-3.1 2-6.9 2.9-10.7 2.5C11 46.3 4.4 39.8 5.1 31.1c.5-6.8 4.7-11.1 8.6-15.3 4.4-4.8 8.7-8.7 10.2-13Z"
        fill={`url(#${outer})`}
      />
      <path
        d="M21.7 24.5c.6 3.7-3.4 5.8-3.4 10.1 0 3.4 2.3 5.8 5.4 5.8 3 0 5.4-2.4 5.4-5.5 0-3.7-2.8-5.7-4.3-8.1-.8-1.3-1.3-2.8-1.3-4.4-.7.7-1.3 1.4-1.8 2.1Z"
        fill={`url(#${inner})`}
      />
      <path d="M15.5 16.7c2-2.4 3.8-4.3 5.2-6.6" stroke="var(--ping-flame-shine)" strokeWidth="2" strokeLinecap="round" />
      <path d="M33.6 15.3c1.8 1.2 3.1 2.8 3.8 4.8" stroke="var(--ping-flame-spark)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="37.2" cy="12.1" r="1.4" fill="var(--ping-flame-spark)" />
    </svg>
  );
}

export function ProfileCardIcon({ className }: ChatShareIconProps) {
  const id = useId().replace(/:/g, "");
  const card = `${id}-card`;
  const avatar = `${id}-avatar`;

  return (
    <svg className={className} viewBox="0 0 48 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={card} x1="5" y1="4" x2="43" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--profile-card-start)" />
          <stop offset="1" stopColor="var(--profile-card-end)" />
        </linearGradient>
        <linearGradient id={avatar} x1="10" y1="11" x2="24" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--profile-card-avatar-start)" />
          <stop offset="1" stopColor="var(--profile-card-avatar-end)" />
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="42" height="32" rx="7" fill={`url(#${card})`} />
      <rect x="3.8" y="4.8" width="40.4" height="30.4" rx="6.2" stroke="var(--profile-card-border)" strokeWidth="1.6" />
      <circle cx="16" cy="18" r="7" fill={`url(#${avatar})`} />
      <path d="M11.2 29.1c.8-3.1 2.5-4.6 4.8-4.6s4 1.5 4.8 4.6" fill="var(--profile-card-avatar-detail)" />
      <circle cx="16" cy="16.8" r="2.8" fill="var(--profile-card-avatar-detail)" />
      <rect x="27" y="13" width="12" height="2.6" rx="1.3" fill="var(--profile-card-line-strong)" />
      <rect x="27" y="19" width="9" height="2" rx="1" fill="var(--profile-card-line)" />
      <rect x="27" y="24" width="11" height="2" rx="1" fill="var(--profile-card-line)" />
      <circle cx="40.5" cy="8.7" r="2.3" fill="var(--profile-card-badge)" />
      <path d="m39.5 8.7.7.7 1.4-1.5" stroke="var(--profile-card-badge-ink)" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
