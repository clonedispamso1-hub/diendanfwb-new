// src/components/bots/queue-counters.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { listQueue, type QueueRow } from "@/lib/bot-system";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime-registry";
import { motion } from "framer-motion";

export function QueueCounters() {
  const [rows, setRows] = useState<QueueRow[]>([]);

  async function load() {
    try {
      setRows(await listQueue(500));
    } catch {
      /* RLS may deny — show zeros */
    }
  }

  useEffect(() => {
    load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useRealtime(
    "queue-rt",
    useMemo(() => [{ table: "bot_activity_queue" as const, event: "*" as const }], []),
    useCallback(() => load(), []),
  );

  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    processing: rows.filter((r) => r.status === "processing").length,
    done: rows.filter((r) => r.status === "done").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  const cards = [
    { label: "Pending", value: counts.pending, icon: Clock, color: "from-yellow-500/30 to-amber-500/10" },
    { label: "Processing", value: counts.processing, icon: Activity, color: "from-blue-500/30 to-cyan-500/10" },
    { label: "Done (recent)", value: counts.done, icon: CheckCircle2, color: "from-emerald-500/30 to-green-500/10" },
    { label: "Failed", value: counts.failed, icon: AlertCircle, color: "from-red-500/30 to-rose-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${c.color} p-4 backdrop-blur-xl`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className="mt-1 text-3xl font-bold tabular-nums">{c.value}</div>
              </div>
              <Icon className="h-6 w-6 opacity-70" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
