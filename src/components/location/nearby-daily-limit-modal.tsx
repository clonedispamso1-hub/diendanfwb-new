/**
 * Daily search-limit paywall — KHÔNG có link Zalo trực tiếp.
 * Hiển thị khi user thường đã xem đủ 20 profile/ngày.
 */
import { Crown, Clock, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface NearbyDailyLimitModalProps {
  open: boolean;
  onClose: () => void;
}

function nextResetIn(): string {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  const ms = next.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}p`;
}

export function NearbyDailyLimitModal({ open, onClose }: NearbyDailyLimitModalProps) {
  const [resetIn, setResetIn] = useState(nextResetIn());
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setResetIn(nextResetIn()), 60_000);
    return () => window.clearInterval(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-400/40 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/80 backdrop-blur hover:bg-background"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,.18), rgba(244,63,94,.14) 60%, transparent)",
          }}
        >
          <div
            className="mx-auto grid h-20 w-20 place-items-center rounded-full text-white shadow-xl"
            style={{
              background: "linear-gradient(135deg,#f59e0b,#f97316,#f43f5e)",
              boxShadow: "0 18px 40px -10px rgba(244,63,94,.55)",
            }}
          >
            <Crown className="h-9 w-9" />
          </div>

          <h2 className="mt-5 text-lg font-extrabold leading-tight">
            Bạn đã hết lượt tìm kiếm hôm nay
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Để tìm kiếm nhiều hơn, vui lòng tham gia{" "}
            <span className="font-semibold text-foreground">Nhóm Zalo VIP</span>!
          </p>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Quay lại sau {resetIn}
          </div>
        </div>

        <div className="space-y-3 border-t bg-background/60 p-5 text-sm">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-amber-900 dark:text-amber-100">
            <div className="flex items-center gap-2 font-bold">
              <Sparkles className="h-4 w-4 text-amber-600" />
              Cách tham gia nhóm Zalo VIP
            </div>
            <p className="mt-1.5 text-xs leading-relaxed opacity-95">
              Liên hệ Admin thông qua{" "}
              <span className="font-semibold">Trung tâm trợ giúp</span> hoặc{" "}
              <span className="font-semibold">Tin nhắn hệ thống</span> để được hướng dẫn tham gia
              nhóm VIP Zalo.
            </p>
          </div>

          <button
            onClick={onClose}
            className="h-12 w-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-base font-extrabold text-white shadow-lg shadow-rose-500/30 hover:opacity-95"
          >
            Đã hiểu — Liên hệ Admin
          </button>
        </div>
      </div>
    </div>
  );
}

export default NearbyDailyLimitModal;
