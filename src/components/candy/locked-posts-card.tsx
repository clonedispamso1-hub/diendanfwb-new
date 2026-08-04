import { Lock, Link2, Crown, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface LockedPostsCardProps {
  requiredVip?: number;
  onUpgrade?: () => void;
}

/**
 * Khối UI "khóa dây xích" hiển thị khi người dùng VIP < 2 cố xem
 * bài viết của profile người khác. Hiệu ứng glassmorphism + neon indigo.
 */
export function LockedPostsCard({ requiredVip = 2, onUpgrade }: LockedPostsCardProps) {
  const handleUpgrade = () => {
    if (onUpgrade) return onUpgrade();
    toast.info(
      "Liên hệ Admin trong mục Cài đặt hoặc nhắn tin để được hỗ trợ nâng cấp VIP 1 - VIP 15.",
      { duration: 5000 }
    );
  };

  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-indigo-400/30 dark:border-indigo-300/20"
      style={{
        fontFamily:
          "'Urbanist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Blurred preview backdrop (giả lập 100 bài viết bên dưới) */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-sky-500/15" />
        <div className="absolute inset-0 backdrop-blur-2xl bg-card/60 dark:bg-black/40" />
        {/* fake post placeholders */}
        <div className="absolute inset-0 p-5 space-y-4 opacity-40 blur-sm select-none pointer-events-none">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border bg-card/70 p-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-28 rounded bg-muted" />
                  <div className="h-2 w-16 rounded bg-muted/70" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-2.5 w-full rounded bg-muted" />
                <div className="h-2.5 w-5/6 rounded bg-muted" />
                <div className="h-2.5 w-2/3 rounded bg-muted" />
              </div>
              <div className="mt-3 h-32 rounded-xl bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Neon glow halos */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl" />

      {/* Foreground content */}
      <div className="relative px-6 py-10 sm:py-14 flex flex-col items-center text-center">
        {/* Chain + Lock icon stack */}
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-6 rounded-full bg-indigo-500/30 blur-2xl animate-pulse" />
          <div
            className="relative grid place-items-center h-24 w-24 rounded-3xl border border-indigo-300/40 bg-gradient-to-br from-indigo-500/30 via-indigo-600/20 to-fuchsia-500/30 backdrop-blur-md shadow-[0_0_40px_rgba(99,102,241,0.55)]"
          >
            <Link2
              size={56}
              className="text-indigo-200 drop-shadow-[0_0_12px_rgba(165,180,252,0.9)]"
              strokeWidth={2.25}
            />
            <span className="absolute -bottom-2 -right-2 grid place-items-center h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 ring-2 ring-background shadow-[0_0_18px_rgba(168,85,247,0.7)]">
              <Lock size={18} className="text-white" strokeWidth={2.5} />
            </span>
          </div>
        </div>

        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 border border-indigo-400/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-200 dark:text-indigo-200">
          <Sparkles size={12} /> Premium Content
        </span>

        {/* Headline */}
        <h3 className="mt-4 max-w-md text-[19px] sm:text-xl font-extrabold leading-snug tracking-tight text-foreground">
          Nội dung đã bị khóa!
        </h3>
        <p className="mt-2 max-w-md text-sm sm:text-[15px] leading-relaxed text-muted-foreground">
          Bạn cần đạt <strong className="text-foreground">Cấp độ VIP {requiredVip}</strong> trở lên
          để mở khóa và xem tất cả bài viết của người này.
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={handleUpgrade}
          className="group relative mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(99,102,241,0.45)] transition active:scale-[0.97] transform-gpu"
          style={{
            background:
              "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)",
          }}
        >
          <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition bg-white/10" />
          <Crown size={16} className="relative" />
          <span className="relative">Nâng cấp VIP ngay</span>
        </button>

        <p className="mt-3 text-[11px] text-muted-foreground/80">
          Mở khóa toàn bộ bài viết · Tối ưu hiệu năng · Tiết kiệm dữ liệu
        </p>
      </div>
    </div>
  );
}
