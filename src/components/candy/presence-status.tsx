import { useIsOnline } from "@/lib/presence";

/**
 * Shared presence UI — a single source of truth for the green/gray dot and
 * the "Online" / "Offline" label used across chat and profile.
 *
 * Rule (V6): Online when present in realtime OR last_seen within 5 minutes.
 * Otherwise the label is plainly "Offline" — never "Offline N ngày/giờ/phút".
 */
/** V6: Cửa sổ coi là còn Online: 5 phút. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

export function isRecentlyActive(lastSeen?: string | number | Date | null): boolean {
  if (!lastSeen) return false;
  const ts = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_WINDOW_MS;
}

/** V6: luôn chỉ là "Offline" — không hiển thị số ngày/giờ/phút. */
export function offlineLabel(_lastSeen?: string | number | Date | null): string {
  return "Offline";
}


export function usePresence(
  userId?: string | null,
  lastSeen?: string | number | Date | null,
  isVirtual?: boolean | null,
) {
  const live = useIsOnline(userId, isVirtual);
  const online = !!isVirtual || live || isRecentlyActive(lastSeen);
  return { online, label: online ? "Online" : offlineLabel(lastSeen) };
}

interface Props {
  userId?: string | null;
  lastSeen?: string | number | Date | null;
  isVirtual?: boolean | null;
  /** Render the text label next to the dot. */
  withLabel?: boolean;
  className?: string;
}

/** Dot only — positioned by the parent avatar wrapper. */
export function PresenceDot({ userId, lastSeen, isVirtual, className }: Props) {
  const { online, label } = usePresence(userId, lastSeen, isVirtual);
  return (
    <span
      className={`presence-dot${online ? " is-online" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
    />
  );
}

/** Inline "🟢 Online" / "⚪ Offline" status line. */
export function PresenceStatus({ userId, lastSeen, isVirtual, className }: Props) {
  const { online, label } = usePresence(userId, lastSeen, isVirtual);
  return (
    <span className={`presence-status${online ? " is-online" : ""}${className ? ` ${className}` : ""}`}>
      <span className={`presence-status__dot${online ? " is-online" : ""}`} aria-hidden />
      <span className="presence-status__text">{label}</span>
    </span>
  );
}
