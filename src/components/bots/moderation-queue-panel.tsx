// src/components/bots/moderation-queue-panel.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listModerationQueue, reviewModeration, type ModerationItem } from "@/lib/bot-system";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime-registry";

export function ModerationQueuePanel() {
  const [rows, setRows] = useState<ModerationItem[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    try {
      setRows(await listModerationQueue("pending", 100));
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  useRealtime(
    "mod-queue-rt",
    useMemo(() => [{ table: "moderation_queue" as const, event: "*" as const }], []),
    useCallback(() => load(), []),
  );

  async function act(id: number, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      await reviewModeration(id, decision);
      toast.success(decision === "approved" ? "Đã duyệt" : "Đã từ chối");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!rows)
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-muted-foreground">
        🎉 Hàng đợi trống — không có nội dung nào chờ duyệt.
      </div>
    );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl transition hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-white/10">
                  {r.target_type}
                </Badge>
                <span className="font-mono text-muted-foreground">{r.target_id}</span>
                <span className={`font-semibold ${r.risk_score >= 70 ? "text-red-500" : r.risk_score >= 40 ? "text-orange-400" : "text-yellow-400"}`}>
                  risk {r.risk_score}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.reasons.map((reason, i) => (
                  <span key={i} className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                    {reason}
                  </span>
                ))}
              </div>
              {r.snapshot && (
                <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-black/30 p-2 text-xs">
                  {JSON.stringify(r.snapshot, null, 2)}
                </pre>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button size="sm" variant="ghost" disabled={busy === r.id}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Xem
              </Button>
              <Button size="sm" variant="default" disabled={busy === r.id} onClick={() => act(r.id, "approved")}>
                <Check className="mr-1 h-3.5 w-3.5" /> Duyệt
              </Button>
              <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => act(r.id, "rejected")}>
                <X className="mr-1 h-3.5 w-3.5" /> Từ chối
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
