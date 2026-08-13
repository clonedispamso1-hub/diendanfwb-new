import { useEffect, useState, useCallback } from "react";
import { Coins, Gift, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, StatCard, EmptyHint } from "./module-shell";

type Row = Record<string, any>;

export function FinancialPanel() {
  const sb = supabase as any;
  const [topSpenders, setTop] = useState<Row[]>([]);
  const [recentLogs, setLogs] = useState<Row[]>([]);
  const [available, setAvailable] = useState({ logs: true, gifts: true });

  const load = useCallback(async () => {
    const top = await sb.from("profiles").select("id, full_name, gem_balance").order("gem_balance", { ascending: false }).limit(10);
    setTop((top.data as Row[]) ?? []);

    const logs = await sb.from("candy_logs")
      .select("id, reason, type, amount, from_user_id, to_user_id, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (logs.error && /does not exist/i.test(logs.error.message)) setAvailable((s) => ({ ...s, logs: false }));
    else setLogs((logs.data as Row[]) ?? []);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  // Suspicious = single transfer > 10000 candy
  const suspicious = recentLogs.filter((l) => Math.abs(Number(l.amount ?? 0)) > 10000);

  return (
    <ModuleShell
      title="Financial Panel"
      subtitle="Coin / gift logs, phát hiện bất thường"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Giao dịch mới" value={recentLogs.length} />
        <StatCard label="Bất thường" value={suspicious.length} tone={suspicious.length ? "bad" : "good"} />
        <StatCard label="Top spender" value={topSpenders[0]?.candy ?? 0} hint={topSpenders[0]?.full_name ?? "—"} />
      </div>

      <div className="adm-section-title">Top 10 giàu nhất</div>
      <div className="adm-list">
        {topSpenders.map((u, i) => (
          <div key={u.id} className="adm-row">
            <div className="adm-row-icon"><Coins size={16} /></div>
            <div className="adm-row-main">
              <div className="adm-row-title">#{i + 1} · {u.full_name || u.id.slice(0, 8)}</div>
              <div className="adm-row-meta"><span>🍬 {u.gem_balance ?? 0}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="adm-section-title">Giao dịch gần đây</div>
      {!available.logs ? (
        <EmptyHint>Bảng <code>candy_logs</code> không tồn tại — bỏ qua.</EmptyHint>
      ) : recentLogs.length === 0 ? (
        <EmptyHint>Chưa có giao dịch.</EmptyHint>
      ) : (
        <div className="adm-list">
          {recentLogs.slice(0, 15).map((l) => (
            <div key={l.id} className="adm-row">
              <div className="adm-row-icon"><Gift size={16} /></div>
              <div className="adm-row-main">
                <div className="adm-row-title">{l.reason || l.type || "transfer"} · {l.amount ?? 0}</div>
                <div className="adm-row-meta">
                  <span>{l.from_user_id?.slice(0, 8) || "system"} → {l.to_user_id?.slice(0, 8) || "—"}</span>
                  {Math.abs(Number(l.amount ?? 0)) > 10000 && (
                    <span className="adm-badge adm-badge-bad"><AlertTriangle size={10} /> bất thường</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
