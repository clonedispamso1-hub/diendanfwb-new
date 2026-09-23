import type { SVGProps } from "react";

type NavIconProps = SVGProps<SVGSVGElement> & {
  active?: boolean;
};

function IconFrame({ active = false, children, ...props }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      vectorEffect="non-scaling-stroke"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3.75 10.5 12 3.9l8.25 6.6" />
      <path d="M5.5 9.2v9.05c0 .97.78 1.75 1.75 1.75h9.5c.97 0 1.75-.78 1.75-1.75V9.2" />
      <path d="M9.25 20v-5.15c0-.75.6-1.35 1.35-1.35h2.8c.75 0 1.35.6 1.35 1.35V20" />
    </IconFrame>
  );
}

export function AlbumNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3.25" y="5.25" width="17.5" height="14" rx="2" />
      <circle cx="8.25" cy="9.25" r="1.45" />
      <path d="m4.25 17 4.4-4.25 3.1 2.85 2.55-2.35 5.45 4.75" />
    </IconFrame>
  );
}

export function FeedbackNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5.25 4.75h13.5c1.1 0 2 .9 2 2v8.1c0 1.1-.9 2-2 2h-7.1l-4.8 3.1.85-3.1H5.25c-1.1 0-2-.9-2-2v-8.1c0-1.1.9-2 2-2Z" />
      <path d="m12 7.35.72 1.48 1.63.23-1.18 1.15.28 1.62L12 11.07l-1.45.76.28-1.62-1.18-1.15 1.63-.23L12 7.35Z" />
    </IconFrame>
  );
}

export function ChatNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 5.25h16c1.1 0 2 .9 2 2v8.25c0 1.1-.9 2-2 2h-8.25L6.2 20.6l.95-3.1H4c-1.1 0-2-.9-2-2V7.25c0-1.1.9-2 2-2Z" />
      <path d="M7.5 11.4h.01M12 11.4h.01M16.5 11.4h.01" strokeWidth="2.4" />
    </IconFrame>
  );
}

export function ProfileNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="m8.35 5.15 1.3-1.75L12 5.15l2.35-1.75 1.3 1.75" />
      <circle cx="12" cy="9.4" r="3.35" />
      <path d="M5.35 20.1c.7-3.1 3.25-5.15 6.65-5.15s5.95 2.05 6.65 5.15" />
    </IconFrame>
  );
}