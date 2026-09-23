import { useId } from "react";

interface PremiumFlameIconProps {
  className?: string;
}

export function PremiumFlameIcon({ className }: PremiumFlameIconProps) {
  const gradientId = useId().replace(/:/g, "");
  const innerGradientId = `${gradientId}-inner`;

  return (
    <svg className={className} viewBox="0 0 32 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="4" x2="25" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--chat-flame-highlight)" />
          <stop offset="0.48" stopColor="var(--chat-flame-hot)" />
          <stop offset="1" stopColor="var(--chat-flame-deep)" />
        </linearGradient>
        <linearGradient id={innerGradientId} x1="13" y1="20" x2="19" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--chat-flame-core)" />
          <stop offset="1" stopColor="var(--chat-flame-highlight)" />
        </linearGradient>
      </defs>
      <path
        d="M17.7 2.8c1.1 5.1-2.1 7.5-4.8 10.3-2.3 2.4-2.8 4.8-1.8 7.2.6-2.7 2.5-4.5 4.6-6.2-.1 3.4 2 5.3 4 7.4 1.5 1.6 2.3 3.7 1.8 6.1 2.3-2 3.5-4.8 3.1-7.7 4.1 4 4.3 10.4.5 14.6-2.2 2.4-5.4 3.8-9 3.8-6.7 0-12.1-4.7-12.1-11 0-5.4 3.2-8.7 6.1-12 3.3-3.8 6.7-7.4 7.6-12.5Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M16.2 20.2c.4 3-2.7 4.5-2.7 7.7 0 2.6 1.7 4.5 4.1 4.5 2.2 0 4-1.7 4-4.1 0-2.7-2.2-4.3-3.3-6.2-.7-1.1-1-2.3-1-3.5-.4.5-.8 1-1.1 1.6Z"
        fill={`url(#${innerGradientId})`}
      />
      <path d="M12.1 12.4c1.2-1.4 2.4-2.8 3.3-4.2" stroke="var(--chat-flame-shine)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}