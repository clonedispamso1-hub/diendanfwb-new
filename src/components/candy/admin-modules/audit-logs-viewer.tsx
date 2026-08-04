import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Filter, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, EmptyHint } from "./module-shell";
import { listAdminLogs, type AdminLogRow } from "@/lib/admin-management";

const MODULE_FILTERS = [
  "all",
  "admin_perm_manager",
  "bot_control",
  "moderation",
  "finance",
  "live",
  "security",
  "analytics",
];

export function AuditLogsViewer() {
  const sb = supabase as any;
  const [logs, setLogs] = useState<AdminLogRow[] | null>(null);
  const [mod, setMod] = useState("all");

  async function load() {
    setLogs(await listAdminLogs(200));
  }

  useEffect(() => {
    void load();
    const ch = sb
      .channel("admin_logs_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_logs" }, () => void load())
      .subscribe();
    return () => sb.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!logs) return [];
    return mod === "all" ? logs : logs.filter((l) => l.module === mod);
  }, [logs, mod]);

  return (
    <ModuleShell
      title="Audit Logs"
      subtitle="Mọi hành động admin — realtime"
      actions={
        <button className="icon-button" onClick={() => void load()} aria-label="reload">
          <RefreshCw size={14} />
        </button>
      }
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", padding: "2px 0 8px" }}>
        <Filter size={12} style={{ opacity: 0.6 }} />
        {MODULE_FILTERS.map((m) => (
          <button
            key={m}
            onClick={() => setMod(m)}
            className="adm-tag"
            style={{
              cursor: "pointer",
              background: mod === m ? "rgba(96,165,250,.25)" : undefined,
              color: mod === m ? "#bfdbfe" : undefined,
              whiteSpace: "nowrap",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {logs == null ? (
        <EmptyHint>Đang tải…</EmptyHint>
      ) : filtered.length === 0 ? (
        <EmptyHint>Chưa có hoạt động nào.</EmptyHint>
      ) : (
        <div className="adm-list">
          {filtered.map((l) => (
            <div key={l.id} className="adm-row">
              <div className="adm-row-icon">
                <Activity size={14} />
              </div>
              <div className="adm-row-main">
                <div className="adm-row-title">
                  {l.actor?.display_name || l.actor?.username || (l.actor_id ? l.actor_id.slice(0, 8) : "system")}{" "}
                  <span style={{ opacity: 0.7, fontWeight: 400 }}>· {l.action}</span>
                </div>
                <div className="adm-row-meta">
                  <span className="adm-tag">{l.module}</span>
                  {l.target_type && (
                    <span>
                      → {l.target_type}:{(l.target_id ?? "").slice(0, 8)}
                    </span>
                  )}
                  <span>{new Date(l.created_at).toLocaleString()}</span>
                </div>
                {l.metadata && Object.keys(l.metadata).length > 0 && (
                  <div style={{ fontSize: ".7rem", opacity: 0.55, marginTop: 2 }}>
                    {JSON.stringify(l.metadata)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
