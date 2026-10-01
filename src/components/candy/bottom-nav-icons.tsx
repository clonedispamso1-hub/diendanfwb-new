import { type SVGProps } from "react";

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

/** Flat flame icon for the HOT tab — same stroke style as the other nav icons. */
export function HotNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props} className="dock-hot-icon">
      <path d="M12 3c2.9 3.1 5 5.7 5 9a5 5 0 0 1-10 0c0-1.9.8-3.5 2-4.9.3 1.3 1.1 2.2 2.2 2.6C10.6 7.6 11 5.2 12 3Z" />
    </IconFrame>
  );
}

/** Flat group/people icon for the Nhóm tab — same stroke style as the other nav icons. */
export function GroupNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="9.2" cy="7.8" r="3.3" />
      <path d="M3.6 20c.6-3 2.9-4.9 5.6-4.9s5 1.9 5.6 4.9" />
      <path d="M15.3 4.8a3.3 3.3 0 0 1 0 6" />
      <path d="M17.6 15.4c1.6.7 2.8 2.4 3.1 4.6" />
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