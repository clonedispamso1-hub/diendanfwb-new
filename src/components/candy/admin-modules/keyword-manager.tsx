import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, EmptyHint, StatCard } from "./module-shell";
import { normalizeText, invalidateKeywordCache } from "@/lib/keyword-filter";

interface KW { id: number; keyword: string; normalized: string; severity: string; penalty: number; created_at?: string }
interface KLog {
  id: number; user_id: string; username?: string | null; content: string;
  matched_keyword: string; penalty: number; created_at: string;
  context_type?: string | null; severity?: string | null;
  ip_address?: string | null; device?: string | null;
}
interface ModStats {
  total?: number; total_all?: number; critical?: number;
  by_type?: Record<string, number>;
  top_keywords?: Array<{ keyword: string; count: number }>;
  top_users?: Array<{ user_id: string; username: string | null; count: number }>;
}

const KIND_LABEL: Record<string, string> = {
  post: "Bài viết", comment: "Bình luận", message: "Tin nhắn",
};

export function KeywordManager() {
  const sb = supabase as any;
  const [keywords, setKeywords] = useState<KW[]>([]);
  const [logs, setLogs] = useState<KLog[]>([]);
  const [stats, setStats] = useState<ModStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKw, setNewKw] = useState("");
  const [newPenalty, setNewPenalty] = useState(5);
  const [newSeverity, setNewSeverity] = useState("medium");
  const [tab, setTab] = useState<"list" | "logs" | "stats">("list");

  const load = useCallback(async () => {
    setLoading(true);
    const [kw, lg, st] = await Promise.all([
      sb.from("banned_keywords").select("*").order("id", { ascending: false }),
      sb.from("keyword_logs").select("*").order("created_at", { ascending: false }).limit(200),
      sb.rpc("admin_moderation_stats", { _days: 30 }),
    ]);
    setKeywords((kw.data as KW[]) ?? []);
    setLogs((lg.data as KLog[]) ?? []);
    setStats((st?.data as ModStats) ?? null);
    setLoading(false);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const k = newKw.trim();
    if (!k) return;
    const norm = normalizeText(k);
    if (!norm) { alert("Từ khoá không hợp lệ sau khi chuẩn hoá."); return; }
    const { error } = await sb.rpc("admin_add_keyword", {
      _keyword: k, _severity: newSeverity, _penalty: newPenalty,
    });
    if (error) { alert(error.message); return; }
    setNewKw(""); setNewPenalty(5);
    invalidateKeywordCache();
    void load();
  };

  const remove = async (id: number) => {
    if (!confirm("Xoá từ khoá này?")) return;
    const { error } = await sb.rpc("admin_delete_keyword", { _id: id });
    if (error) { alert(error.message); return; }
    invalidateKeywordCache();
    void load();
  };

  const updatePenalty = async (id: number, penalty: number) => {
    const { error } = await sb.rpc("admin_update_keyword", { _id: id, _penalty: penalty });
    if (error) { alert(error.message); return; }
    invalidateKeywordCache();
    void load();
  };

  return (
    <ModuleShell
      title="Bot Từ khoá"
      subtitle="CRUD từ khoá cấm + log vi phạm"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Tổng từ khoá" value={keywords.length} />
        <StatCard label="Vi phạm (30 ngày)" value={stats?.total ?? logs.length} tone={(stats?.total ?? logs.length) ? "warn" : "good"} />
        <StatCard label="Nghiêm trọng" value={stats?.critical ?? 0} tone={(stats?.critical ?? 0) ? "warn" : "good"} />
        <StatCard label="Tổng vi phạm" value={stats?.total_all ?? logs.length} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`secondary-cta compact ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>Từ khoá</button>
        <button className={`secondary-cta compact ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>Log vi phạm</button>
        <button className={`secondary-cta compact ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>Thống kê</button>
      </div>

      {tab === "list" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px auto", gap: 8, marginBottom: 12 }}>
            <input className="adm-input" placeholder="Từ khoá mới (vd: cặc)" value={newKw} onChange={(e) => setNewKw(e.target.value)} />
            <input className="adm-input" type="number" min={0} max={100} value={newPenalty} onChange={(e) => setNewPenalty(Number(e.target.value))} />
            <select className="adm-input" value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
            <button className="primary-cta" onClick={() => void add()}><Plus size={14} /> Thêm</button>
          </div>

          {loading ? <EmptyHint>Đang tải…</EmptyHint> : keywords.length === 0 ? (
            <EmptyHint>Chưa có từ khoá nào.</EmptyHint>
          ) : (
            <div className="adm-list">
              {keywords.map((k) => (
                <div key={k.id} className="adm-row">
                  <div className="adm-row-main">
                    <div className="adm-row-title">{k.keyword}</div>
                    <div className="adm-row-meta">
                      <span>norm: <code>{k.normalized}</code></span>
                      <span>severity: {k.severity}</span>
                    </div>
                  </div>
                  <input
                    className="adm-input"
                    type="number"
                    style={{ width: 80 }}
                    value={k.penalty}
                    onChange={(e) => void updatePenalty(k.id, Number(e.target.value))}
                  />
                  <button className="secondary-cta compact danger-button" onClick={() => void remove(k.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : tab === "logs" ? (
        <>
          {loading ? <EmptyHint>Đang tải…</EmptyHint> : logs.length === 0 ? (
            <EmptyHint>Chưa có vi phạm.</EmptyHint>
          ) : (
            <div className="adm-list">
              {logs.map((l) => (
                <div key={l.id} className="adm-row">
                  <div className="adm-row-icon"><ScrollText size={16} /></div>
                  <div className="adm-row-main">
                    <div className="adm-row-title">
                      {l.username ? <b>@{l.username}</b> : null}{" "}
                      <code>{(l.user_id || "").slice(0, 8)}</code> · khớp{" "}
                      <b style={{ color: "#f87171" }}>{l.matched_keyword}</b>
                      {l.severity === "critical" ? <span style={{ color: "#ef4444" }}> · NGHIÊM TRỌNG</span> : null}
                    </div>
                    <div className="adm-row-meta">
                      <span>{KIND_LABEL[l.context_type || "post"] || l.context_type}</span>
                      <span>-{l.penalty} uy tín</span>
                      <span>{new Date(l.created_at).toLocaleString()}</span>
                      {l.ip_address ? <span>IP: {l.ip_address}</span> : null}
                    </div>
                    {l.device ? (
                      <div style={{ marginTop: 2, fontSize: "0.7rem", opacity: 0.55 }}>
                        {l.device.slice(0, 120)}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 4, fontSize: "0.75rem", opacity: 0.8 }}>
                      {l.content?.slice(0, 200)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? <EmptyHint>Đang tải…</EmptyHint> : !stats ? (
            <EmptyHint>Chưa có dữ liệu thống kê (cần chạy migration kiểm duyệt).</EmptyHint>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div className="adm-row-title" style={{ marginBottom: 6 }}>Vi phạm theo loại (30 ngày)</div>
                <div className="adm-stat-grid">
                  {(["post", "comment", "message"] as const).map((k) => (
                    <StatCard key={k} label={KIND_LABEL[k]} value={stats.by_type?.[k] ?? 0} />
                  ))}
                </div>
              </div>
              <div>
                <div className="adm-row-title" style={{ marginBottom: 6 }}>Từ khoá dính nhiều nhất</div>
                <div className="adm-list">
                  {(stats.top_keywords ?? []).length === 0 ? <EmptyHint>Chưa có.</EmptyHint> :
                    (stats.top_keywords ?? []).map((k) => (
                      <div key={k.keyword} className="adm-row">
                        <div className="adm-row-main"><div className="adm-row-title">{k.keyword}</div></div>
                        <b>{k.count}</b>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <div className="adm-row-title" style={{ marginBottom: 6 }}>Người vi phạm nhiều nhất</div>
                <div className="adm-list">
                  {(stats.top_users ?? []).length === 0 ? <EmptyHint>Chưa có.</EmptyHint> :
                    (stats.top_users ?? []).map((u) => (
                      <div key={u.user_id} className="adm-row">
                        <div className="adm-row-main">
                          <div className="adm-row-title">
                            {u.username ? `@${u.username}` : <code>{(u.user_id || "").slice(0, 8)}</code>}
                          </div>
                        </div>
                        <b>{u.count}</b>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </ModuleShell>
  );
}
