import { Eye, Heart, Lock, Crown } from "lucide-react";

interface EngagementLockedCardProps {
  vipLevel: number | null | undefined;
}

const REQUIRED_VIP = 3;

/**
 * 2 thẻ "Ai đã xem" / "Ai thích" trên trang profile của chính mình.
 * Hiển thị overlay khoá nếu vip_level < 3 (theo chốt với user).
 * Logic ghi nhận xem/thích sẽ làm sau — đây là UI surface.
 */
export function EngagementLockedCard({ vipLevel }: EngagementLockedCardProps) {
  const unlocked = (vipLevel ?? 1) >= REQUIRED_VIP;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card
        icon={<Eye size={18} className="text-sky-600" />}
        title="Ai đã xem bạn"
        unlocked={unlocked}
        accent="from-sky-500/15 to-sky-500/0"
      />
      <Card
        icon={<Heart size={18} className="text-rose-500" />}
        title="Ai thích bạn"
        unlocked={unlocked}
        accent="from-rose-500/15 to-rose-500/0"
      />
    </div>
  );
}

function Card({
  icon, title, unlocked, accent,
}: {
  icon: React.ReactNode;
  title: string;
  unlocked: boolean;
  accent: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm`}>
      <div className={`absolute inset-0 bg-gradient-to-b ${accent} pointer-events-none`} />
      <div className="relative flex items-center gap-2">
        <span className="grid place-items-center h-9 w-9 rounded-full bg-background/80 backdrop-blur">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="relative mt-3 flex items-end justify-between">
        <span className={`text-2xl font-bold tracking-tight ${unlocked ? "" : "blur-sm select-none"}`}>
          {unlocked ? "—" : "12"}
        </span>
        {!unlocked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-1 text-[11px] font-semibold">
            <Crown size={12} /> VIP {REQUIRED_VIP}
          </span>
        ) : null}
      </div>
      {!unlocked ? (
        <div className="relative mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Lock size={11} /> Mở khoá với VIP {REQUIRED_VIP}+
        </div>
      ) : null}
    </div>
  );
}
