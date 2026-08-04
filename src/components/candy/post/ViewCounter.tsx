import { Eye } from "lucide-react";
import { formatCount } from "@/lib/format";
import { usePostCard } from "./post-card-context";

/**
 * ViewCounter — read-only impression count. Rendered as a non-button
 * chip inside the reaction bar so it never traps focus or receives clicks.
 */
export function ViewCounter() {
  const { viewCount } = usePostCard();
  return (
    <span
      className="pc-action pc-view"
      title="Lượt xem"
      aria-label={`${viewCount.toLocaleString()} lượt xem`}
    >
      <span className="pc-action-icon">
        <Eye size={18} strokeWidth={2.2} />
      </span>
      <span className="pc-action-count">{formatCount(viewCount)}</span>
    </span>
  );
}
