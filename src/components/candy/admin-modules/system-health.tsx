import { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, Database, Wifi, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ModuleShell, StatCard, StatusBadge } from "./module-shell";

type Component = { key: string; label: string; icon: any; status: "healthy" | "degraded" | "down"; latency?: number; detail?: string };

export function SystemHealth() {
  const sb = supabase as any;
  const [comps, setComps] = useState<Component[]>([]);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const out: Component[] = [];

    // DB latency
    const t0 = performance.now();
    const dbRes = await sb.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    const dbMs = Math.round(performance.now() - t0);
    out.push({
      key: "db",
      label: "Database",
      icon: Database,
      status: dbRes.error ? "down" : dbMs < 500 ? "healthy" : "degraded",
      latency: dbMs,
      detail: dbRes.error?.message,
    });

    // Realtime
    let rtStatus: Component["status"] = "down";
    await new Promise<void>((resolve) => {
      const ch = sb.channel("health-probe-" + Math.random().toString(36).slice(2)).subscribe((s: string) => {
        if (s === "SUBSCRIBED") { rtStatus = "healthy"; sb.removeChannel(ch); resolve(); }
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") { rtStatus = "down"; sb.removeChannel(ch); resolve(); }
      });
      setTimeout(() => { sb.removeChannel(ch); resolve(); }, 4000);
    });
    out.push({ key: "realtime", label: "Realtime / WebSocket", icon: Wifi, status: rtStatus });

    // Auth
    const t1 = performance.now();
    const sess = await sb.auth.getSession();
    out.push({
      key: "auth",
      label: "Auth",
      icon: Zap,
      status: sess.error ? "down" : "healthy",
      latency: Math.round(performance.now() - t1),
    });

    setComps(out);
    setChecking(false);

    // Best-effort: log snapshot
    try {
      await Promise.all(out.map((c) =>
        sb.from("system_health_logs").insert({
          component: c.key, status: c.status, latency_ms: c.latency ?? null, details: { detail: c.detail ?? null },
        })
      ));
    } catch { /* ignore */ }
  }, [sb]);

  useEffect(() => { void check(); }, [check]);

  const healthy = comps.filter((c) => c.status === "healthy").length;
  const overall = comps.every((c) => c.status === "healthy") ? "healthy" : comps.some((c) => c.status === "down") ? "down" : "degraded";

  return (
    <ModuleShell
      title="System Health"
      subtitle="DB, realtime, auth — kiểm tra khi mở hoặc khi làm mới"
      actions={<button className="icon-button" onClick={() => void check()} disabled={checking}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Trạng thái" value={overall} tone={overall === "healthy" ? "good" : overall === "down" ? "bad" : "warn"} />
        <StatCard label="Healthy" value={`${healthy}/${comps.length}`} />
      </div>

      <div className="adm-list">
        {comps.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="adm-row">
              <div className="adm-row-icon"><Icon size={16} /></div>
              <div className="adm-row-main">
                <div className="adm-row-title">{c.label}</div>
                <div className="adm-row-meta">
                  <StatusBadge status={c.status} />
                  {c.latency != null && <span>{c.latency}ms</span>}
                  {c.detail && <span style={{ color: "var(--destructive, #ef4444)" }}>{c.detail}</span>}
                </div>
              </div>
              <Activity size={14} className={c.status === "healthy" ? "adm-pulse-good" : "adm-pulse-bad"} />
            </div>
          );
        })}
      </div>
    </ModuleShell>
  );
}
