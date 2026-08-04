import { useEffect, useState, useCallback } from "react";
import { Bot, Power, AlertTriangle, RefreshCw, Users, Settings2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, StatCard, StatusBadge, EmptyHint } from "./module-shell";
import { logAdminAction } from "@/lib/admin-permissions";
import { BotAssignmentsPanel } from "@/components/bots/bot-assignments-panel";
import { listAssignments, updateAssignment, type BotAssignmentRow } from "@/lib/bot-assignments";

type BotRow = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  is_virtual?: boolean | null;
  is_banned?: boolean | null;
  status?: string | null;
  role?: string | null;
  gem_balance?: number | null;
  last_seen?: string | null;
};

type Tab = "virtual" | "assignments";

export function BotControlCenter() {
  const sb = supabase as any;
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("assignments");
  const [configRow, setConfigRow] = useState<BotAssignmentRow | null>(null);
  const [assignCount, setAssignCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("profiles")
      .select("id, full_name, username, is_virtual, is_banned, status, role, gem_balance, last_seen")
      .eq("is_virtual", true)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(100);
    setBots((data as BotRow[]) ?? []);
    setLoading(false);
    try {
      const a = await listAssignments();
      setAssignCount(a.length);
    } catch {
      /* table may not exist yet */
    }
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const toggleBan = async (b: BotRow) => {
    const next = !b.is_banned;
    const { error } = await sb.from("profiles").update({ is_banned: next }).eq("id", b.id);
    if (!error) {
      await logAdminAction("bot_control", next ? "disable_bot" : "enable_bot", "profile", b.id);
      void load();
    }
  };

  const active = bots.filter((b) => !b.is_banned).length;
  const disabled = bots.filter((b) => b.is_banned).length;

  return (
    <ModuleShell
      title="Bot Control Center"
      subtitle="Quản lý bot ảo + gán user thật làm bot"
      actions={<button className="icon-button" onClick={() => void load()} aria-label="reload"><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Bot ảo" value={bots.length} tone="neutral" />
        <StatCard label="Đang hoạt động" value={active} tone="good" />
        <StatCard label="Đã tắt" value={disabled} tone="warn" />
        <StatCard label="User-bots" value={assignCount} tone="neutral" />
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0 8px" }}>
        <button
          onClick={() => setTab("assignments")}
          className="adm-tag"
          style={{
            cursor: "pointer",
            background: tab === "assignments" ? "rgba(167,139,250,.25)" : undefined,
            color: tab === "assignments" ? "#ddd6fe" : undefined,
          }}
        >
          <Users size={11} /> User Bot Assignments
        </button>
        <button
          onClick={() => setTab("virtual")}
          className="adm-tag"
          style={{
            cursor: "pointer",
            background: tab === "virtual" ? "rgba(167,139,250,.25)" : undefined,
            color: tab === "virtual" ? "#ddd6fe" : undefined,
          }}
        >
          <Bot size={11} /> Bot ảo
        </button>
      </div>

      {tab === "assignments" ? (
        <BotAssignmentsPanelWithConfig onConfig={setConfigRow} />
      ) : (
        <>
          <div className="adm-section-title">Danh sách bot ảo</div>
          {loading ? (
            <EmptyHint>Đang tải…</EmptyHint>
          ) : bots.length === 0 ? (
            <EmptyHint>Chưa có bot nào.</EmptyHint>
          ) : (
            <div className="adm-list">
              {bots.map((b) => (
                <div key={b.id} className="adm-row">
                  <div className="adm-row-icon"><Bot size={16} /></div>
                  <div className="adm-row-main">
                    <div className="adm-row-title">{b.full_name || b.username || b.id.slice(0, 8)}</div>
                    <div className="adm-row-meta">
                      <StatusBadge status={b.is_banned ? "bad" : "good"} />
                      <span>{b.role || "bot"}</span>
                      <span>🍬 {b.gem_balance ?? 0}</span>
                    </div>
                  </div>
                  <button
                    className={`secondary-cta compact ${b.is_banned ? "" : "danger-button"}`}
                    onClick={() => void toggleBan(b)}
                    style={{ padding: "6px 10px", fontSize: "0.75rem" }}
                  >
                    <Power size={12} /> {b.is_banned ? "Bật" : "Tắt"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="adm-note" style={{ marginTop: 10 }}>
        <AlertTriangle size={12} /> Hành động đều được ghi vào <code>admin_logs</code>.
      </div>

      {configRow && (
        <BotConfigSheet row={configRow} onClose={() => setConfigRow(null)} />
      )}
    </ModuleShell>
  );
}

function BotAssignmentsPanelWithConfig({ onConfig }: { onConfig: (r: BotAssignmentRow) => void }) {
  const [rows, setRows] = useState<BotAssignmentRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    const sb = supabase as any;
    async function load() {
      try {
        const data = await listAssignments();
        if (alive) setRows(data);
      } catch {
        if (alive) setRows([]);
      }
    }
    void load();
    const ch = sb
      .channel("bot_assignments_cfg_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_assignments" }, load)
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, []);
  return (
    <div>
      <BotAssignmentsPanel />
      {rows && rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="adm-section-title">Cấu hình nâng cao</div>
          <div className="adm-list">
            {rows.map((r) => (
              <div key={r.id} className="adm-row">
                <div className="adm-row-icon"><Settings2 size={14} /></div>
                <div className="adm-row-main">
                  <div className="adm-row-title">
                    {r.profile?.display_name || r.profile?.username || r.user_id.slice(0, 8)}
                  </div>
                  <div className="adm-row-meta">
                    <span>cooldown {r.cooldown_config?.min_seconds ?? "?"}-{r.cooldown_config?.max_seconds ?? "?"}s</span>
                    <span>·/h {r.activity_config?.max_actions_per_hour ?? "—"}</span>
                    <span>·/d {r.activity_config?.max_actions_per_day ?? "—"}</span>
                  </div>
                </div>
                <button
                  className="secondary-cta compact"
                  onClick={() => onConfig(r)}
                  style={{ padding: "6px 10px", fontSize: "0.75rem" }}
                >
                  <Settings2 size={12} /> Cấu hình
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BotConfigSheet({ row, onClose }: { row: BotAssignmentRow; onClose: () => void }) {
  const [cdMin, setCdMin] = useState<number>(row.cooldown_config?.min_seconds ?? 30);
  const [cdMax, setCdMax] = useState<number>(row.cooldown_config?.max_seconds ?? 120);
  const [perHour, setPerHour] = useState<number>(row.activity_config?.max_actions_per_hour ?? 30);
  const [perDay, setPerDay] = useState<number>(row.activity_config?.max_actions_per_day ?? 200);
  const [hourStart, setHourStart] = useState<number>(row.activity_config?.active_hours?.start ?? 7);
  const [hourEnd, setHourEnd] = useState<number>(row.activity_config?.active_hours?.end ?? 23);
  const [priority, setPriority] = useState<number>(row.priority_level);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateAssignment(row.id, {
        priority_level: priority,
        cooldown_config: { ...row.cooldown_config, min_seconds: cdMin, max_seconds: cdMax },
        activity_config: {
          ...row.activity_config,
          max_actions_per_hour: perHour,
          max_actions_per_day: perDay,
          active_hours: { start: hourStart, end: hourEnd },
        },
      });
      await logAdminAction("bot_control", "update_bot_config", "bot_assignment", row.id, {
        cdMin, cdMax, perHour, perDay, hourStart, hourEnd, priority,
      });
      onClose();
    } catch (e: any) {
      alert(e.message ?? "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200,
        display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto",
          background: "color-mix(in oklab, var(--background, #0a0b14) 92%, black)",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: "1px solid color-mix(in oklab, currentColor 14%, transparent)",
        }}
      >
        <div style={{ position: "sticky", top: 0, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "inherit", borderBottom: "1px solid color-mix(in oklab, currentColor 8%, transparent)" }}>
          <div style={{ fontWeight: 600 }}>Cấu hình bot · {row.profile?.display_name || row.profile?.username}</div>
          <button className="icon-button" aria-label="close" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          <Field label="Priority (1–10)"><NumInput value={priority} onChange={setPriority} min={1} max={10} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Cooldown min (s)"><NumInput value={cdMin} onChange={setCdMin} min={0} /></Field>
            <Field label="Cooldown max (s)"><NumInput value={cdMax} onChange={setCdMax} min={0} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Tối đa / giờ"><NumInput value={perHour} onChange={setPerHour} min={0} /></Field>
            <Field label="Tối đa / ngày"><NumInput value={perDay} onChange={setPerDay} min={0} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Giờ hoạt động — bắt đầu"><NumInput value={hourStart} onChange={setHourStart} min={0} max={23} /></Field>
            <Field label="Giờ hoạt động — kết thúc"><NumInput value={hourEnd} onChange={setHourEnd} min={0} max={23} /></Field>
          </div>
          <button
            disabled={busy}
            onClick={save}
            className="adm-tag"
            style={{
              justifyContent: "center", padding: 12, borderRadius: 12,
              background: "linear-gradient(135deg, rgba(167,139,250,.35), rgba(96,165,250,.35))",
              color: "white", marginTop: 6, cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".75rem", opacity: 0.85 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        padding: "8px 10px", borderRadius: 10,
        border: "1px solid color-mix(in oklab, currentColor 14%, transparent)",
        background: "color-mix(in oklab, currentColor 5%, transparent)",
        fontSize: ".85rem",
      }}
    />
  );
}

