import { BadgeCheck } from "lucide-react";

interface VerifiedBadgeProps {
  verified?: boolean | null;
  size?: number;
  className?: string;
  showLabel?: boolean;
}

/**
 * Badge "Đã xác thực". Chỉ render khi verified === true.
 * Style mềm, bo tròn — phù hợp Telegram/Threads/FB.
 */
export function VerifiedBadge({ verified, size = 14, className = "", showLabel = false }: VerifiedBadgeProps) {
  if (!verified) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sky-500 ${className}`}
      title="Đã xác thực"
      aria-label="Đã xác thực"
    >
      <BadgeCheck size={size} className="fill-sky-500/15" />
      {showLabel && <span className="text-xs font-medium">Đã xác thực</span>}
    </span>
  );
}

export default VerifiedBadge;
