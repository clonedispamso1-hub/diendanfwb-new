import { useIsOnline } from "@/lib/presence";

/**
 * Shared presence UI — a single source of truth for the green/gray dot and
 * the "Online" / "Offline X ngày trước" label used across chat and profile.
 *
 * Rule (2026-08): a user counts as Online when present in realtime OR their
 * last_seen is within the last 3 DAYS. Only after 3+ days of inactivity do we
 * show "Offline N ngày trước" (never hours / 1–2 ngày).
 */
const DAY_MS = 86_400_000;
/** Cửa sổ coi là còn Online: 3 ngày. */
export const ONLINE_WINDOW_MS = 3 * DAY_MS;

export function isRecentlyActive(lastSeen?: string | number | Date | null): boolean {
  if (!lastSeen) return false;
  const ts = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ONLINE_WINDOW_MS;
}

export function offlineLabel(lastSeen?: string | number | Date | null): string {
  if (!lastSeen) return "Offline";
  const ts = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) return "Offline";
  const days = Math.max(3, Math.floor((Date.now() - ts) / DAY_MS));
  return `Offline ${days > 999 ? "999+" : days} ngày trước`;
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

/** Inline "🟢 Online" / "⚪ Offline 2 ngày" status line. */
export function PresenceStatus({ userId, lastSeen, isVirtual, className }: Props) {
  const { online, label } = usePresence(userId, lastSeen, isVirtual);
  return (
    <span className={`presence-status${online ? " is-online" : ""}${className ? ` ${className}` : ""}`}>
      <span className={`presence-status__dot${online ? " is-online" : ""}`} aria-hidden />
      <span className="presence-status__text">{label}</span>
    </span>
  );
}
