/**
 * Bot Từ khoá — chỉ còn 2 tab:
 *   1. Từ khoá            → CRUD danh sách từ khoá cấm.
 *   2. Tài khoản vi phạm  → danh sách UID vi phạm, mở OffenderDetail để xử lý.
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw, UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ModuleShell, EmptyHint, StatCard } from "./module-shell";
import { normalizeText, invalidateKeywordCache } from "@/lib/keyword-filter";
import {
  keywordModerationService,
  type KeywordOffender,
} from "@/services/keyword-moderation.service";
import { OffenderDetail } from "./offender-detail";

interface KW { id: number; keyword: string; normalized: string; severity: string; penalty: number; created_at?: string }

export function KeywordManager() {
  const sb = supabase as any;
  const [keywords, setKeywords] = useState<KW[]>([]);
  const [offenders, setOffenders] = useState<KeywordOffender[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKw, setNewKw] = useState("");
  const [newPenalty, setNewPenalty] = useState(5);
  const [newSeverity, setNewSeverity] = useState("medium");
  const [tab, setTab] = useState<"list" | "offenders">("list");
  const [selected, setSelected] = useState<KeywordOffender | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [kw, off] = await Promise.all([
      sb
        .from("banned_keywords")
        .select("id, keyword, normalized, severity, penalty, created_at")
        .order("id", { ascending: false })
        .limit(300),
      keywordModerationService.listOffenders(100).catch(() => [] as KeywordOffender[]),
    ]);
    setKeywords((kw.data as KW[]) ?? []);
    setOffenders(off);
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
    if (error) {
      // RPC cũ chưa gán "normalized" → tự insert kèm normalized (không bao giờ null).
      const legacyNormalizedBug = /normalized/i.test(error.message || "");
      if (!legacyNormalizedBug) { alert(error.message); return; }
      const { error: insErr } = await sb
        .from("banned_keywords")
        .upsert(
          { keyword: k, normalized: norm, severity: newSeverity, penalty: newPenalty },
          { onConflict: "keyword" },
        );
      if (insErr) { alert(insErr.message); return; }
    }
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

  const totalViolations = offenders.reduce((s, o) => s + (o.violations || 0), 0);

  return (
    <ModuleShell
      title="Bot Từ khoá"
      subtitle="CRUD từ khoá cấm + tài khoản vi phạm"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="Tổng từ khoá" value={keywords.length} />
        <StatCard label="Tài khoản vi phạm" value={offenders.length} tone={offenders.length ? "warn" : "good"} />
        <StatCard label="Tổng vi phạm" value={totalViolations} tone={totalViolations ? "warn" : "good"} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`secondary-cta compact ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>Từ khóa</button>
        <button className={`secondary-cta compact ${tab === "offenders" ? "active" : ""}`} onClick={() => setTab("offenders")}>Tài khoản vi phạm</button>
      </div>

      {tab === "list" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px auto", gap: 8, marginBottom: 12 }}>
            <input className="adm-input" placeholder="Từ khoá mới" value={newKw} onChange={(e) => setNewKw(e.target.value)} />
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
      ) : (
        <>
          {loading ? <EmptyHint>Đang tải…</EmptyHint> : offenders.length === 0 ? (
            <EmptyHint>Chưa có tài khoản vi phạm.</EmptyHint>
          ) : (
            <div className="adm-list">
              {offenders.map((o) => (
                <div key={o.user_id} className="adm-row">
                  <div className="adm-row-icon"><UserX size={16} /></div>
                  <div className="adm-row-main">
                    <div className="adm-row-title">
                      {o.username ? <b>@{o.username}</b> : null}{" "}
                      <code>{(o.user_id || "").slice(0, 8)}</code>
                    </div>
                    <div className="adm-row-meta">
                      <span>{o.violations} lần vi phạm</span>
                      {o.last_keyword ? <span>Từ khoá: <b style={{ color: "#f87171" }}>{o.last_keyword}</b></span> : null}
                      {o.last_at ? <span>{new Date(o.last_at).toLocaleString("vi-VN")}</span> : null}
                    </div>
                  </div>
                  <button className="secondary-cta compact" onClick={() => setSelected(o)}>
                    Xử lý
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selected ? (
        <OffenderDetail
          offender={selected}
          onClose={() => { setSelected(null); void load(); }}
        />
      ) : null}
    </ModuleShell>
  );
}
