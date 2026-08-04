import { ShieldCheck } from "lucide-react";

interface TrustScoreBadgeProps {
  score?: number | null;
  className?: string;
}

/**
 * Hiển thị "🛡️ Uy tín 95%" — không lộ cách tính.
 */
export function TrustScoreBadge({ score, className = "" }: TrustScoreBadgeProps) {
  const s = Math.max(0, Math.min(100, Math.round(Number(score ?? 0))));
  if (s <= 0) return null;
  const tone =
    s >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10"
    : s >= 50 ? "text-amber-600 bg-amber-50 dark:bg-amber-500/10"
    : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone} ${className}`}
      title="Điểm uy tín"
    >
      <ShieldCheck size={12} />
      Uy tín {s}%
    </span>
  );
}

export default TrustScoreBadge;
