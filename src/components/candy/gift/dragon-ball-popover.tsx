import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, Sparkles } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { DragonBallIcon, type BallTier } from "./dragon-ball-icon";
import { DRAGON_BALL_CATALOG } from "./dragon-ball-catalog";

const DESCRIPTIONS: Record<BallTier, string> = {
  1: "Viên khởi đầu bộ sưu tập. Gom đủ 7 viên để triệu hồi Rồng Thần.",
  2: "Ngọc 2 sao — hiếm gấp đôi. Có thể đổi Coin ngay hoặc gom bộ.",
  3: "Ngọc 3 sao — bước gần hơn tới Rồng Thần.",
  4: "Ngọc 4 sao — hiếm và có giá trị.",
  5: "Ngọc 5 sao — rất hiếm gặp.",
  6: "Ngọc 6 sao — cực hiếm, sát bộ triệu hồi.",
  7: "Ngọc 7 sao — huyền thoại. Đổi ra Coin cực lớn hoặc gom đủ bộ để Gọi Rồng.",
};

interface Props {
  tier: BallTier;
  quantity?: number;
  onExchange?: () => void;
  onSummon?: () => void;
  canSummon?: boolean;
  size?: number;
  disabled?: boolean;
  badge?: boolean;
  onSelect?: (tier: BallTier) => void;
}

export function DragonBallPopover({
  tier,
  quantity = 0,
  onExchange,
  onSummon,
  canSummon = false,
  size = 64,
  disabled = false,
  badge = true,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const item = DRAGON_BALL_CATALOG.find((b) => b.tier === tier);

  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches);
  }, []);

  // Popover chi tiết (Đổi Coin/Gọi Rồng) đã tạm ngưng; tile mở modal Chuyển
  // Ngọc Rồng thông qua onSelect.
  {
    return (
      <button
        type="button"
        disabled={disabled || quantity <= 0}
        onClick={() => onSelect?.(tier)}
        className="group relative flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-card p-3 transition-all hover:border-amber-500 hover:shadow-[0_0_24px_rgba(251,146,60,0.35)] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        aria-label={`Ngọc Rồng ${tier} Sao`}
      >
        <div className="relative">
          <DragonBallIcon tier={tier} size={size} />
          {badge && quantity > 0 && (
            <span className="absolute -bottom-1 -right-1 min-w-[22px] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[11px] font-bold text-white shadow">
              ×{quantity}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-center">{tier}★</p>
      </button>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          onMouseEnter={() => { if (!isTouch) setOpen(true); }}
          onMouseLeave={() => { if (!isTouch) setOpen(false); }}
          className={`group relative flex flex-col items-center justify-center rounded-2xl border p-3 transition-all
            ${disabled
              ? "border-border/30 bg-muted/20 opacity-50"
              : "border-amber-500/30 bg-card hover:border-amber-500 hover:shadow-[0_0_24px_rgba(251,146,60,0.35)] hover:-translate-y-0.5"}`}
          aria-label={`Ngọc Rồng ${tier} Sao`}
        >
          <div className="relative">
            <DragonBallIcon tier={tier} size={size} />
            {badge && quantity > 0 && (
              <span className="absolute -bottom-1 -right-1 min-w-[22px] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[11px] font-bold text-white shadow">
                ×{quantity}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] font-semibold text-center">{tier}★</p>
          <p className="text-[10px] text-muted-foreground">
            {item?.amount.toLocaleString("vi-VN")}
          </p>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={10}
          collisionPadding={12}
          className="z-[100050] outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 6 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="w-[260px] rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-2xl backdrop-blur"
                style={{ boxShadow: "0 20px 50px -10px rgba(251,146,60,0.35), 0 4px 20px rgba(0,0,0,0.15)" }}
              >
                <div className="flex items-center gap-3 border-b border-border/50 p-3">
                  <div className="relative flex-shrink-0">
                    <div
                      className="absolute inset-0 -z-10 rounded-full blur-xl"
                      style={{ background: "radial-gradient(circle, rgba(251,146,60,0.45), transparent 70%)" }}
                    />
                    <DragonBallIcon tier={tier} size={44} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">🐉 Ngọc Rồng {tier} Sao</p>
                    {quantity > 0 && (
                      <p className="text-[11px] text-muted-foreground">Bạn có ×{quantity} viên</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-2.5 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">Giá trị đổi</span>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-400">
                      <Coins size={13} /> {item?.amount.toLocaleString("vi-VN")} Coin
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {DESCRIPTIONS[tier]}
                  </p>
                </div>
                {(onExchange || onSummon) && (
                  <div className="flex flex-col gap-1.5 border-t border-border/50 p-2.5">
                    {onExchange && (
                      <button
                        type="button"
                        disabled={quantity <= 0}
                        onClick={() => { setOpen(false); onExchange?.(); }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                      >
                        <Coins size={13} /> Đổi Coin
                      </button>
                    )}
                    {onSummon && canSummon && (
                      <button
                        type="button"
                        onClick={() => { setOpen(false); onSummon?.(); }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-red-500 px-3 py-2 text-xs font-bold text-white transition hover:opacity-95"
                      >
                        <Sparkles size={13} /> Gọi Rồng
                      </button>
                    )}
                  </div>
                )}
                <Popover.Arrow className="fill-popover" width={12} height={6} />
              </motion.div>
            )}
          </AnimatePresence>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
