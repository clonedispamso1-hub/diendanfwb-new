// src/components/bots/bots-overview.tsx
import { useEffect, useState } from "react";
import { listBots, type BotAccount } from "@/lib/bot-system";
import { BotToggleCard } from "./bot-toggle-card";
import { Loader2 } from "lucide-react";

export function BotsOverview() {
  const [bots, setBots] = useState<BotAccount[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setBots(await listBots());
      setErr(null);
    } catch (e: any) {
      setErr(e.message ?? "Không thể tải bots");
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (err) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{err}</div>;
  if (!bots)
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
      </div>
    );
  if (bots.length === 0)
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
        Chưa có bot nào. Hãy chạy SQL migration <code>2026051900_bot_system.sql</code> trước.
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bots.map((b) => (
        <BotToggleCard key={b.id} bot={b} onChange={load} />
      ))}
    </div>
  );
}
