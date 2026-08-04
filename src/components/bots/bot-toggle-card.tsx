// src/components/bots/bot-toggle-card.tsx
import { motion } from "framer-motion";
import { Bot, Zap, ShieldAlert, MessageSquareWarning, UserPlus, Activity, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  type BotAccount,
  BOT_TYPE_LABEL,
  RISK_COLOR,
  setBotActive,
  setBotIntensity,
} from "@/lib/bot-system";
import { useState } from "react";
import { toast } from "sonner";

const ICONS: Record<BotAccount["bot_type"], React.ComponentType<{ className?: string }>> = {
  engagement_bot: Zap,
  moderation_bot: ShieldAlert,
  spam_guard: Power,
  comment_guard: MessageSquareWarning,
  register_guard: UserPlus,
  risk_detection_bot: Activity,
};

export function BotToggleCard({ bot, onChange }: { bot: BotAccount; onChange?: () => void }) {
  const [active, setActive] = useState(bot.active);
  const [level, setLevel] = useState(bot.automation_level);
  const [busy, setBusy] = useState(false);
  const Icon = ICONS[bot.bot_type] ?? Bot;

  async function toggle(next: boolean) {
    setActive(next);
    setBusy(true);
    try {
      await setBotActive(bot.id, next);
      toast.success(`${bot.display_name} ${next ? "đã bật" : "đã tắt"}`);
      onChange?.();
    } catch (e: any) {
      setActive(!next);
      toast.error(e.message ?? "Không thể cập nhật");
    } finally {
      setBusy(false);
    }
  }

  async function commitLevel(v: number[]) {
    setLevel(v[0]);
    try {
      await setBotIntensity(bot.id, v[0]);
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi cập nhật cường độ");
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-lg"
    >
      <div
        className={`pointer-events-none absolute inset-0 opacity-30 transition-opacity ${
          active ? "bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent" : ""
        }`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2.5">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">{bot.display_name}</div>
            <div className="text-xs text-muted-foreground">@{bot.username}</div>
          </div>
        </div>
        <Switch checked={active} disabled={busy} onCheckedChange={toggle} />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="bg-white/10 text-foreground/80">
          {BOT_TYPE_LABEL[bot.bot_type]}
        </Badge>
        <span className={RISK_COLOR[bot.risk_level]}>● {bot.risk_level}</span>
        {bot.last_active && (
          <span className="text-muted-foreground">
            last {new Date(bot.last_active).toLocaleString()}
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Intensity</span>
          <span>{level}/10</span>
        </div>
        <Slider value={[level]} max={10} step={1} onValueChange={(v) => setLevel(v[0])} onValueCommit={commitLevel} />
      </div>
    </motion.div>
  );
}
