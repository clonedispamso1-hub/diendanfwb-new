import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldX,
  Loader2,
  Crown,
  Pause,
  Play,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ModuleShell, EmptyHint, StatCard } from "./module-shell";
import {
  ADMIN_ROLES,
  ROLE_ACCENT,
  ROLE_LABEL,
  type AdminCandidate,
  type AdminRole,
  type AdminUserRow,
  assignRole,
  listAdminUsers,
  removeRole,
  restoreAdmin,
  searchAdminCandidates,
  suspendAdmin,
} from "@/lib/admin-management";

export function AdminPermissionsManager() {
  const sb = supabase as any;
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await listAdminUsers());
      setErr(null);
    } catch (e: any) {
      setErr(e.message ?? "Lỗi tải admins");
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) return setIsSuper(false);
      const { data: p } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      const legacy = !!p?.is_admin;
      const { data: r } = await sb
        .from("admin_permissions")
        .select("permission")
        .eq("user_id", u.user.id)
        .eq("permission", "super_admin")
        .maybeSingle();
      setIsSuper(legacy || !!r);
    })();
    const ch = sb
      .channel("admin_perm_manager_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_permissions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_role_assignments" }, () => void load())
      .subscribe();
    return () => sb.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = filter.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        (r.username ?? "").toLowerCase().includes(t) ||
        (r.display_name ?? "").toLowerCase().includes(t),
    );
  }, [rows, filter]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      active: list.filter((r) => !r.suspended).length,
      suspended: list.filter((r) => r.suspended).length,
      super: list.filter((r) => r.roles.includes("super_admin") || r.is_legacy_admin).length,
    };
  }, [rows]);

  return (
    <ModuleShell
      title="Admin Permissions Manager"
      subtitle="Cấp quyền — Tìm user, chọn vai trò, xác nhận"
    >
      <div className="adm-stat-grid">
        <StatCard label="Tổng admins" value={totals.total} tone="neutral" />
        <StatCard label="Hoạt động" value={totals.active} tone="good" />
        <StatCard label="Tạm khoá" value={totals.suspended} tone="warn" />
        <StatCard label="Super" value={totals.super} tone="bad" />
      </div>

      {err && (
        <div className="adm-empty" style={{ borderColor: "rgba(239,68,68,.5)", color: "#fca5a5" }}>
          {err} — Hãy chạy migration <code>2026052200_admin_perm_manager.sql</code>.
        </div>
      )}

      <GrantForm
        canEdit={!!isSuper}
        onGranted={() => {
          toast({ title: "Đã cấp quyền thành công", description: "Vai trò mới đã được lưu." });
          void load();
        }}
      />

      <div className="adm-section-title">Danh sách Admin</div>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", color: "#deff9a" }} />
        <input
          className="adm-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Tìm admin theo username / tên…"
          style={{ paddingLeft: 36 }}
        />
      </div>

      {rows == null ? (
        <EmptyHint>Đang tải…</EmptyHint>
      ) : filtered.length === 0 ? (
        <EmptyHint>Chưa có admin nào.</EmptyHint>
      ) : (
        <div className="adm-list">
          {filtered.map((r) => (
            <AdminCard
              key={r.user_id}
              row={r}
              canEdit={!!isSuper}
              onEdit={() => setEditing(r)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditAdminSheet
          row={editing}
          canEdit={!!isSuper}
          onClose={() => setEditing(null)}
          onChange={() => void load()}
        />
      )}
    </ModuleShell>
  );
}

function GrantForm({ canEdit, onGranted }: { canEdit: boolean; onGranted: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminCandidate[]>([]);
  const [picked, setPicked] = useState<AdminCandidate | null>(null);
  const [role, setRole] = useState<AdminRole>("moderation_admin");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    if (!q.trim() || picked) {
      setResults([]);
      return;
    }
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(async () => {
      try {
        setResults(await searchAdminCandidates(q));
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 200);
  }, [q, picked]);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    try {
      await assignRole(picked.id, role);
      setPicked(null);
      setQ("");
      onGranted();
    } catch (e: any) {
      toast({ title: "Cấp quyền thất bại", description: e.message ?? "Lỗi", variant: "destructive" as any });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "#121212",
        border: "1px solid #deff9a",
        borderRadius: 14,
        padding: 18,
        boxShadow: "0 0 18px rgba(222,255,154,.18)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="adm-section-title" style={{ marginTop: 0 }}>Cấp quyền Admin mới</div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr", position: "relative" }}>
        <div>
          <div className="adm-label" style={{ marginBottom: 6 }}>1. Chọn User (username hoặc tên)</div>
          {picked ? (
            <div className="adm-row" style={{ borderColor: "#deff9a" }}>
              <div className="adm-row-icon">
                {picked.avatar_url ? (
                  <img loading="lazy" decoding="async" src={picked.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 999, objectFit: "cover" }} />
                ) : (
                  <span style={{ fontWeight: 800 }}>{(picked.display_name || picked.username || "?").slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="adm-row-main">
                <div className="adm-row-title">{picked.display_name || picked.username}</div>
                <div className="adm-row-meta">@{picked.username ?? "—"}</div>
              </div>
              <button onClick={() => setPicked(null)} className="adm-btn-ghost" aria-label="reset" style={{ padding: 8 }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <input
                className="adm-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setOpen(true)}
                placeholder="Gõ tên hoặc username để tìm…"
              />
              {open && results.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    background: "#181818",
                    border: "1px solid #deff9a",
                    borderRadius: 10,
                    maxHeight: 220,
                    overflow: "auto",
                  }}
                >
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { setPicked(r); setOpen(false); }}
                      style={{
                        width: "100%", textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent", color: "#fff",
                        border: "none", borderBottom: "1px solid rgba(222,255,154,.1)",
                        cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(222,255,154,.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#deff9a", fontWeight: 800 }}>
                        {(r.display_name || r.username || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{r.display_name || r.username}</div>
                        <div style={{ fontSize: ".72rem", color: "#d8e6c8" }}>@{r.username ?? "—"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <div className="adm-label" style={{ marginBottom: 6 }}>2. Chọn vai trò</div>
          <select
            className="adm-select"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
          >
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r} style={{ background: "#121212", color: "#fff" }}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <button
          disabled={!picked || busy || !canEdit}
          onClick={submit}
          className="adm-btn-primary"
          style={{ width: "100%", marginTop: 4 }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
          {canEdit ? "Cấp quyền" : "Chỉ Super Admin"}
        </button>
      </div>
    </div>
  );
}

function AdminCard({
  row,
  canEdit,
  onEdit,
}: {
  row: AdminUserRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const initial = (row.display_name || row.username || "?").slice(0, 1).toUpperCase();
  return (
    <button onClick={onEdit} disabled={!canEdit} className="adm-row" style={{ textAlign: "left", cursor: canEdit ? "pointer" : "default", width: "100%" }}>
      <div className="adm-row-icon" style={{ overflow: "hidden" }}>
        {row.avatar_url ? (
          <img loading="lazy" decoding="async" src={row.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: 999, objectFit: "cover" }} />
        ) : (
          <span style={{ fontWeight: 800 }}>{initial}</span>
        )}
      </div>
      <div className="adm-row-main">
        <div className="adm-row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {row.display_name || row.username || row.user_id.slice(0, 8)}
          {(row.roles.includes("super_admin") || row.is_legacy_admin) && (
            <Crown size={12} style={{ color: "#deff9a", filter: "drop-shadow(0 0 4px #deff9a)" }} />
          )}
          <span
            style={{
              width: 7, height: 7, borderRadius: 999,
              background: row.suspended ? "#facc15" : "#deff9a",
              boxShadow: `0 0 10px ${row.suspended ? "#facc15" : "#deff9a"}`,
            }}
          />
        </div>
        <div className="adm-row-meta">
          {row.roles.length === 0 && row.is_legacy_admin && <span className="adm-tag">legacy admin</span>}
          {row.roles.map((r) => (
            <span
              key={r}
              className="adm-tag"
              style={{
                color: ROLE_ACCENT[r],
                borderColor: ROLE_ACCENT[r] + "55",
                background: ROLE_ACCENT[r] + "20",
              }}
            >
              {ROLE_LABEL[r]}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function EditAdminSheet({
  row,
  canEdit,
  onClose,
  onChange,
}: {
  row: AdminUserRow;
  canEdit: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = async (k: string, fn: () => Promise<void>, msg?: string) => {
    if (!canEdit) return;
    setBusy(k);
    try {
      await fn();
      if (msg) toast({ title: msg });
      onChange();
    } catch (e: any) {
      toast({ title: "Lỗi", description: e.message ?? "—", variant: "destructive" as any });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.7)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto",
          background: "#0f0f0f", color: "#fff",
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          border: "1px solid #deff9a",
          boxShadow: "0 -10px 40px rgba(222,255,154,.2)",
        }}
      >
        <div style={{ position: "sticky", top: 0, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f0f0f", borderBottom: "1px solid rgba(222,255,154,.18)" }}>
          <div style={{ fontWeight: 800, color: "#deff9a", textShadow: "0 0 8px rgba(222,255,154,.5)" }}>
            {row.display_name || row.username || "Admin"}
          </div>
          <button onClick={onClose} className="adm-btn-ghost" style={{ padding: 8 }}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="adm-section-title">Vai trò</div>
          <div className="adm-tag-cloud">
            {ADMIN_ROLES.map((r) => {
              const has = row.roles.includes(r);
              return (
                <button
                  key={r}
                  disabled={!canEdit || busy === `r:${r}`}
                  onClick={() =>
                    wrap(
                      `r:${r}`,
                      () => (has ? removeRole(row.user_id, r) : assignRole(row.user_id, r)),
                      has ? `Đã thu hồi ${ROLE_LABEL[r]}` : `Đã cấp ${ROLE_LABEL[r]}`,
                    )
                  }
                  className="adm-tag"
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${has ? ROLE_ACCENT[r] : "rgba(255,255,255,.15)"}`,
                    background: has ? `${ROLE_ACCENT[r]}25` : "transparent",
                    color: has ? ROLE_ACCENT[r] : "#fff",
                    cursor: canEdit ? "pointer" : "default",
                    padding: "6px 12px",
                    fontWeight: 700,
                  }}
                >
                  {has ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                  {ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
            {row.suspended ? (
              <button
                disabled={!canEdit || busy === "rest"}
                onClick={() => wrap("rest", () => restoreAdmin(row.user_id), "Đã khôi phục admin")}
                className="adm-btn-ghost"
                style={{ borderColor: "#deff9a", color: "#deff9a" }}
              >
                <Play size={13} /> Khôi phục
              </button>
            ) : (
              <button
                disabled={!canEdit || busy === "sus"}
                onClick={() => wrap("sus", () => suspendAdmin(row.user_id), "Đã tạm khoá admin")}
                className="adm-btn-ghost"
                style={{ borderColor: "#facc15", color: "#fde68a" }}
              >
                <Pause size={13} /> Tạm khoá
              </button>
            )}
            <button
              disabled={!canEdit || busy === "rm"}
              onClick={() =>
                wrap(
                  "rm",
                  async () => {
                    if (!confirm("Xoá toàn bộ role của admin này?")) return;
                    for (const r of row.roles) await removeRole(row.user_id, r);
                  },
                  "Đã bỏ admin",
                )
              }
              className="adm-btn-ghost"
              style={{ borderColor: "#ef4444", color: "#fca5a5" }}
            >
              <ShieldX size={13} /> Bỏ admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
