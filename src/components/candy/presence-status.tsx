/**
 * Shared presence UI — nguồn duy nhất cho huy hiệu trạng thái hoạt động.
 *
 * V7: Mọi người dùng luôn hiển thị "Hoạt động" với huy hiệu tích xanh 3D.
 * Không còn chấm xám / chữ "Offline" ở bất kỳ đâu trong giao diện tin nhắn.
 */
export const ONLINE_WINDOW_MS = 5 * 60_000;

export const ACTIVE_LABEL = "Hoạt động";

export function isRecentlyActive(_lastSeen?: string | number | Date | null): boolean {
  return true;
}

/** V7: luôn là "Hoạt động". */
export function offlineLabel(_lastSeen?: string | number | Date | null): string {
  return ACTIVE_LABEL;
}

export function usePresence(
  _userId?: string | null,
  _lastSeen?: string | number | Date | null,
  _isVirtual?: boolean | null,
) {
  return { online: true, label: ACTIVE_LABEL };
}

interface Props {
  userId?: string | null;
  lastSeen?: string | number | Date | null;
  isVirtual?: boolean | null;
  /** Render the text label next to the dot. */
  withLabel?: boolean;
  className?: string;
}

/** Tích xanh 3D — SVG thuần, không cần asset ảnh. */
function TickMark({ size = 10 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path
        d="M5 12.6l4.2 4.2L19 7"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Huy hiệu tích xanh 3D — đặt vị trí bởi wrapper avatar. */
export function PresenceDot({ className }: Props) {
  return (
    <span
      className={`presence-dot is-online presence-tick${className ? ` ${className}` : ""}`}
      aria-label={ACTIVE_LABEL}
      title={ACTIVE_LABEL}
    >
      <TickMark size={10} />
    </span>
  );
}

/** Dòng trạng thái "✓ Hoạt động". */
export function PresenceStatus({ className }: Props) {
  return (
    <span className={`presence-status is-online${className ? ` ${className}` : ""}`}>
      <span className="presence-status__dot is-online presence-tick" aria-hidden>
        <TickMark size={8} />
      </span>
      <span className="presence-status__text">{ACTIVE_LABEL}</span>
    </span>
  );
}
