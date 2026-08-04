import type { SVGProps } from "react";

/**
 * Premium custom icons for the app header.
 * Style: rounded caps/joins, medium stroke (1.8), monoline, neutral —
 * inspired by Telegram / Threads / iOS 26. Consumers control color via
 * `currentColor` and size via the `size` prop.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function BaseSvg({ size = 20, children, strokeWidth = 1.8, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PremiumSearchIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="m20 20-4.6-4.6" />
    </BaseSvg>
  );
}

export function PremiumBellIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M6 9.5a6 6 0 0 1 12 0v3.2c0 .9.28 1.77.8 2.5l.7.98c.44.61.01 1.42-.74 1.42H5.24c-.75 0-1.18-.81-.74-1.42l.7-.98a4.3 4.3 0 0 0 .8-2.5V9.5Z" />
      <path d="M10.2 20.2a2 2 0 0 0 3.6 0" />
    </BaseSvg>
  );
}

export function PremiumMoonIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M20.5 14.4A8 8 0 0 1 9.6 3.5a.6.6 0 0 0-.8-.75 9.2 9.2 0 1 0 12.45 12.45.6.6 0 0 0-.75-.8Z" />
    </BaseSvg>
  );
}

export function PremiumSunIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.4 5.4l1.55 1.55M17.05 17.05l1.55 1.55M5.4 18.6l1.55-1.55M17.05 6.95l1.55-1.55" />
    </BaseSvg>
  );
}

export function PremiumMenuIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </BaseSvg>
  );
}

export function PremiumChevronDown(props: IconProps) {
  return (
    <BaseSvg {...props} strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </BaseSvg>
  );
}
