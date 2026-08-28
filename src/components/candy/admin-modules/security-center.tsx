import { useEffect, useState, useCallback, useMemo } from "react";
import { Shield, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { socialDb as db3 } from "@/services/database";
import { useRealtime } from "@/lib/realtime-registry";
import { ModuleShell, StatCard, EmptyHint } from "./module-shell";

type SecEvent = {
  id: number;
  user_id?: string | null;
  event_type: string;
  severity: string;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};
type AdminLog = {
  id: number;
  actor_id?: string | null;
  module: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  created_at: string;
};

export function SecurityCenter() {
  const sb = supabase as any;
  // admin_logs nằm ở Supabase #3; security_events vẫn ở Supabase #1.
  const logsDb = db3() as any;
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [available, setAvailable] = useState({ events: true, logs: true });

  const load = useCallback(async () => {
    const ev = await sb.from("security_events")
      .select("id, user_id, event_type, severity, ip_address, user_agent, metadata, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (ev.error && /does not exist/i.test(ev.error.message)) setAvailable((s) => ({ ...s, events: false }));
    else setEvents((ev.data as SecEvent[]) ?? []);

    const lg = await logsDb.from("admin_logs")
      .select("id, actor_id, module, action, target_type, target_id, created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (lg.error && /does not exist/i.test(lg.error.message)) setAvailable((s) => ({ ...s, logs: false }));
    else setLogs((lg.data as AdminLog[]) ?? []);
  }, [sb, logsDb]);

  useEffect(() => { void load(); }, [load]);

  // Hai channel riêng: security_events ở client #1, admin_logs ở client #3.
  useRealtime(
    "admin-security-events",
    useMemo(() => [{ table: "security_events" as const, event: "INSERT" as const }], []),
    useCallback(() => { void load(); }, [load]),
  );
  useRealtime(
    "admin-security-admin-logs",
    useMemo(() => [{ table: "admin_logs" as const, event: "INSERT" as const }], []),
    useCallback(() => { void load(); }, [load]),
  );

  const critical = events.filter((e) => e.severity === "critical").length;
  const warnings = events.filter((e) => e.severity === "warning").length;

  if (!available.events && !available.logs) {
    return (
      <ModuleShell title="Security Center" subtitle="Cần migration db/2026051400_admin_modules_expansion.sql">
        <EmptyHint>
          Module yêu cầu các bảng <code>security_events</code> và <code>admin_logs</code>. Áp dụng file SQL trong thư mục <code>db/</code> trên Supabase trước.
        </EmptyHint>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="Security Center"
      subtitle="Realtime sự kiện bảo mật & admin logs"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Critical" value={critical} tone={critical ? "bad" : "good"} />
        <StatCard label="Warning" value={warnings} tone={warnings ? "warn" : "good"} />
        <StatCard label="Sự kiện 24h" value={events.length} />
      </div>

      <div className="adm-section-title">Sự kiện bảo mật gần đây</div>
      {events.length === 0 ? <EmptyHint>Chưa có sự kiện.</EmptyHint> : (
        <div className="adm-list">
          {events.slice(0, 20).map((e) => (
            <div key={e.id} className="adm-row">
              <div className="adm-row-icon"><Shield size={16} /></div>
              <div className="adm-row-main">
                <div className="adm-row-title">{e.event_type}{e.severity === "critical" && <> <AlertTriangle size={12} /></>}</div>
                <div className="adm-row-meta">
                  <span className={`adm-badge adm-badge-${e.severity === "critical" ? "bad" : e.severity === "warning" ? "warn" : "good"}`}>{e.severity}</span>
                  {e.ip_address ? <span>IP {String(e.ip_address)}</span> : null}
                  <span>{new Date(e.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="adm-section-title">Admin actions log</div>
      {logs.length === 0 ? <EmptyHint>Chưa có log.</EmptyHint> : (
        <div className="adm-list">
          {logs.slice(0, 15).map((l) => (
            <div key={l.id} className="adm-row">
              <div className="adm-row-icon"><Shield size={16} /></div>
              <div className="adm-row-main">
                <div className="adm-row-title">[{l.module}] {l.action}</div>
                <div className="adm-row-meta">
                  <span>by {l.actor_id?.slice(0, 8) || "system"}</span>
                  {l.target_id && <span>→ {l.target_type}/{l.target_id.slice(0, 8)}</span>}
                  <span>{new Date(l.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
