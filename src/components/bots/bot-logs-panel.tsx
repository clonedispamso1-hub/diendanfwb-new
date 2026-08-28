// src/components/bots/bot-logs-panel.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listLogs, type BotLog } from "@/lib/bot-system";
import { supabase } from "@/lib/supabase";
import { useRealtime, pickNew } from "@/lib/realtime-registry";

export function BotLogsPanel() {
  const [logs, setLogs] = useState<BotLog[] | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    try {
      setLogs(await listLogs(200));
    } catch {
      setLogs([]);
    }
  }

  useEffect(() => { load(); }, []);

  useRealtime(
    "bot-logs-rt",
    useMemo(() => [{ table: "bot_actions_logs" as const, event: "INSERT" as const }], []),
    useCallback((p) => {
      const row = pickNew(p);
      if (row) setLogs((prev) => (prev ? [row as unknown as BotLog, ...prev].slice(0, 200) : prev));
    }, []),
  );

  const filtered = useMemo(() => {
    if (!logs) return null;
    const s = q.trim().toLowerCase();
    if (!s) return logs;
    return logs.filter((l) =>
      [l.action, l.bot_name, l.target_type, l.target_id, l.reason].some((x) => x?.toLowerCase().includes(s))
    );
  }, [logs, q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm action, bot, reason…"
          className="pl-9"
        />
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background/80 backdrop-blur">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Bot</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {!filtered && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin" /> Đang tải…
                </td>
              </tr>
            )}
            {filtered?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có log nào.
                </td>
              </tr>
            )}
            {filtered?.map((l) => (
              <tr key={l.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleTimeString()}
                </td>
                <td className="px-3 py-2 text-xs">{l.bot_name ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="bg-white/10">
                    {l.action}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {l.target_type ? `${l.target_type}/${l.target_id?.slice(0, 8) ?? ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{l.risk_score ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className={
                      l.result === "ok"
                        ? "text-emerald-400"
                        : l.result === "failed"
                        ? "text-red-400"
                        : "text-muted-foreground"
                    }
                  >
                    {l.result ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
