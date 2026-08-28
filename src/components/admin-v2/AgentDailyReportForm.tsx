import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Trash2, Save, CheckCircle2, AlertCircle,
  XCircle, Pencil, Check, Facebook, MessageCircle, Globe, Target,
  Lock, KeyRound, Sparkles, Trophy, ShieldCheck, Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { socialDb as db3 } from "@/services/database";

type FbRow = {
  id?: string;
  fb_uid: string;
  account_name: string;
  twofa_key: string;
  account_password?: string;
  gmail_recovery?: string;
  status: "live" | "die";
  groups_count: number;
  posts_today: number;
  is_submitted?: boolean;
  _editing?: boolean;
  _historical?: boolean;
};

const WEBSITE_TARGET = 1000;
const ZALO_TARGET = 1500;
const FB_UID_RE = /^\d{6,20}$/;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse raw credentials string: Username|Password|2FA|Gmail
 * One account per line. Returns parsed rows ready to insert.
 */
function parseRawAccounts(raw: unknown): Array<Partial<FbRow>> {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      const [username = "", password = "", twofa = "", gmail = ""] = parts;
      return {
        fb_uid: username,
        account_name: username,
        account_password: password,
        twofa_key: twofa,
        gmail_recovery: gmail,
        status: "live" as const,
        groups_count: 0,
        posts_today: 0,
      };
    });
}

export function AgentDailyReportForm({ bangchuId }: { bangchuId?: string | null }) {
  const [rows, setRows] = useState<FbRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rawBulk, setRawBulk] = useState("");
  const [importing, setImporting] = useState(false);

  const [zaloCount, setZaloCount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [websiteMembers, setWebsiteMembers] = useState<number>(0);
  const [zaloMembersTotal, setZaloMembersTotal] = useState<number>(0);

  // Daily targets (mặc định; có thể sửa qua admin)
  const dailyNewTarget = 5;
  const dailyGroupsTarget = 10;

  async function loadAll() {
    setLoadingRows(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoadingRows(false);
        return;
      }

      const today = todayISO();

      const { data: todayRows, error: tErr } = await (supabase as any)
        .from("agent_fb_accounts")
        .select("id, fb_uid, account_name, twofa_key, account_password, gmail_recovery, status, groups_count, posts_today, is_submitted, report_date")
        .eq("agent_id", u.user.id)
        .eq("report_date", today)
        .order("created_at", { ascending: true }).limit(20);
      if (tErr) throw tErr;

      const cur: FbRow[] = (todayRows ?? []).map((r: any) => ({
        id: r.id,
        fb_uid: r.fb_uid,
        account_name: r.account_name ?? "",
        twofa_key: r.twofa_key ?? "",
        account_password: r.account_password ?? "",
        gmail_recovery: r.gmail_recovery ?? "",
        status: r.status,
        groups_count: r.groups_count ?? 0,
        posts_today: r.posts_today ?? 0,
        is_submitted: !!r.is_submitted,
      }));

      if (cur.length) {
        const uids = cur.map((r) => r.fb_uid);
        const { data: hist } = await (supabase as any)
          .from("agent_fb_accounts")
          .select("fb_uid")
          .lt("report_date", today)
          .in("fb_uid", uids);
        const set = new Set((hist ?? []).map((h: any) => h.fb_uid));
        cur.forEach((r) => (r._historical = set.has(r.fb_uid)));
      }
      setRows(cur);

      const { count: wCount } = await (supabase as any)
        .from("profiles")
        .select("id", { count: "exact", head: true });
      setWebsiteMembers(wCount ?? 0);

      const { data: zRows } = await (db3() as any)
        .from("agent_activity_logs")
        .select("zalo_members_count");
      setZaloMembersTotal(
        (zRows ?? []).reduce((s: number, r: any) => s + (r.zalo_members_count || 0), 0),
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Không tải được dữ liệu.");
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const totals = useMemo(() => {
    const live = rows.filter((r) => r.status === "live").length;
    const die = rows.filter((r) => r.status === "die").length;
    const groups = rows.reduce((s, r) => s + (Number(r.groups_count) || 0), 0);
    const posts = rows.reduce((s, r) => s + (Number(r.posts_today) || 0), 0);
    const submitted = rows.filter((r) => r.is_submitted).length;
    return { live, die, groups, posts, total: rows.length, submitted };
  }, [rows]);

  function addRow() {
    setRows((r) => [
      ...r,
      {
        fb_uid: "", account_name: "", twofa_key: "",
        status: "live", groups_count: 0, posts_today: 0, _editing: true,
      },
    ]);
  }

  function updateRow(i: number, patch: Partial<FbRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function deleteRow(i: number) {
    const row = rows[i];
    if (row.is_submitted) {
      toast.error("Dòng này đã gửi báo cáo — không thể xoá.");
      return;
    }
    if (row.id) {
      const { error } = await (supabase as any)
        .from("agent_fb_accounts").delete().eq("id", row.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function saveRow(i: number, opts: { submit?: boolean } = {}) {
    const row = rows[i];
    if (row.is_submitted) {
      toast.error("Dòng đã đóng băng (đã gửi).");
      return;
    }
    if (!FB_UID_RE.test(row.fb_uid.trim())) {
      toast.error("FB UID phải là số (6-20 chữ số).");
      return;
    }
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Chưa đăng nhập.");

      const payload: Record<string, any> = {
        agent_id: u.user.id,
        bangchu_id: bangchuId ?? null,
        fb_uid: row.fb_uid.trim(),
        account_name: row.account_name.trim() || null,
        twofa_key: row.twofa_key?.trim() || null,
        account_password: row.account_password?.trim() || null,
        gmail_recovery: row.gmail_recovery?.trim() || null,
        status: row.status,
        groups_count: Math.max(0, Number(row.groups_count) || 0),
        posts_today: Math.max(0, Number(row.posts_today) || 0),
        report_date: todayISO(),
      };
      if (opts.submit) {
        payload.is_submitted = true;
        payload.submitted_at = new Date().toISOString();
      }

      if (row.id) {
        const { error } = await (supabase as any)
          .from("agent_fb_accounts").update(payload).eq("id", row.id);
        if (error) throw error;
        updateRow(i, { _editing: false, is_submitted: !!opts.submit || row.is_submitted });
      } else {
        const { data, error } = await (supabase as any)
          .from("agent_fb_accounts").insert(payload).select().single();
        if (error) throw error;
        updateRow(i, { id: data.id, _editing: false, is_submitted: !!opts.submit });
      }

      if (opts.submit) {
        toast.success("Thông tin đã được gửi đi thành công!", {
          description: "Dòng đã được đóng băng và mã hoá an toàn.",
          icon: <ShieldCheck className="text-amber-400" />,
        });
      } else {
        toast.success("Đã lưu dòng.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Lỗi không xác định.");
    }
  }

  async function handleBulkImport() {
    if (!rawBulk || typeof rawBulk !== "string" || !rawBulk.trim()) {
      toast.error("Vui lòng điền đầy đủ dữ liệu thô trước khi bấm xử lý!");
      return;
    }
    setImporting(true);
    try {
      const parsed = parseRawAccounts(rawBulk);
      if (!parsed.length) {
        toast.error("Không có dòng dữ liệu hợp lệ.");
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error("Chưa đăng nhập.");
      const inserts = parsed.map((p) => ({
        agent_id: u.user!.id,
        bangchu_id: bangchuId ?? null,
        fb_uid: p.fb_uid,
        account_name: p.account_name ?? null,
        twofa_key: p.twofa_key ?? null,
        account_password: p.account_password ?? null,
        gmail_recovery: p.gmail_recovery ?? null,
        status: "live",
        groups_count: 0,
        posts_today: 0,
        report_date: todayISO(),
        raw_account_data: rawBulk,
        is_submitted: true,
        submitted_at: new Date().toISOString(),
      }));
      const BATCH = 500;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const batch = inserts.slice(i, i + BATCH);
        const { error } = await (supabase as any).from("agent_fb_accounts").insert(batch);
        if (error) throw error;
      }
      toast.success("Thông tin đã được gửi đi thành công!", {
        description: `Đã nhập & đóng băng ${inserts.length} tài khoản.`,
      });
      setRawBulk("");
      loadAll();
    } catch (err: any) {
      console.error("Bulk import error:", err);
      toast.error(err?.message ?? "Đã xảy ra lỗi khi xử lý dữ liệu tài khoản.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmitSummary(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Chưa đăng nhập.");

      const payload: Record<string, any> = {
        agent_id: u.user.id,
        bangchu_id: bangchuId ?? null,
        fb_posts_count: Number(totals.posts) || 0,
        zalo_members_count: Math.max(0, Number(zaloCount) || 0),
        violation_links: [],
        notes: notes.trim() || null,
      };

      const { error } = await (db3() as any)
        .from("agent_activity_logs")
        .insert(payload);
      if (error) throw error;

      toast.success("Đã gửi báo cáo tổng hợp hôm nay!");
      setMsg({ ok: true, text: "Đã gửi báo cáo tổng hợp hôm nay." });
      setZaloCount(0);
      setNotes("");
      loadAll();
    } catch (err: any) {
      const text = err?.message ?? "Lỗi không xác định.";
      setMsg({ ok: false, text });
      toast.error(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* PREMIUM PROGRESS WIDGETS */}
      <div className="adm-module" style={{ display: "grid", gap: 14, background: "linear-gradient(135deg, rgba(20,14,4,.85), rgba(8,8,12,.95))", border: "1px solid rgba(251,191,36,.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={18} color="#fbbf24" />
          <div>
            <h3 className="adm-module-title" style={{ margin: 0, color: "#fde68a", letterSpacing: ".02em" }}>Bảng tiến độ dự án</h3>
            <p className="adm-module-subtitle" style={{ margin: 0 }}>Săn mốc thưởng — Website &amp; Zalo</p>
          </div>
        </div>
        <PremiumProgress
          icon={Globe}
          label="Thành viên Website"
          current={websiteMembers}
          target={WEBSITE_TARGET}
          rewardTitle="Mốc thưởng Thần tốc"
          rewardText="Đạt 1000 TV Web thưởng ngay 5,000,000đ"
          accent="#fbbf24"
          accent2="#f59e0b"
        />
        <PremiumProgress
          icon={MessageCircle}
          label="Thành viên Zalo (thật)"
          current={zaloMembersTotal}
          target={ZALO_TARGET}
          rewardTitle="Mốc thưởng Đỉnh cao"
          rewardText="Đạt 1500 TV Zalo thật thưởng ngay 3,000,000đ"
          accent="#34d399"
          accent2="#10b981"
        />
      </div>

      {/* DAILY ASSIGNMENTS */}
      <div className="adm-module" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 className="adm-module-title"><Target size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Nhiệm vụ hôm nay</h3>
          <p className="adm-module-subtitle">Chỉ tiêu bắt buộc Admin 2 cần hoàn thành trong ngày</p>
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" }}>
          <AssignmentCard
            label="Số nick mới phải nuôi hôm nay"
            current={totals.total}
            target={dailyNewTarget}
            accent="#fbbf24"
          />
          <AssignmentCard
            label="Số nhóm phải tham gia bắt buộc"
            current={totals.groups}
            target={dailyGroupsTarget}
            accent="#60a5fa"
          />
        </div>
      </div>

      {/* AGGREGATION SUMMARY */}
      <div className="adm-module" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 className="adm-module-title"><Facebook size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Tổng hợp nick Facebook hôm nay</h3>
          <p className="adm-module-subtitle">Tự động cộng dồn từ các dòng bên dưới</p>
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))" }}>
          <SummaryStat label="Tổng nick" value={totals.total} color="#deff9a" />
          <SummaryStat label="Đã gửi" value={totals.submitted} color="#fbbf24" />
          <SummaryStat label="Đang Live" value={totals.live} color="#34d399" />
          <SummaryStat label="Die" value={totals.die} color="#ef4444" />
          <SummaryStat label="Tổng nhóm" value={totals.groups} color="#60a5fa" />
          <SummaryStat label="Tổng bài chạy" value={totals.posts} color="#a78bfa" />
        </div>
      </div>

      {/* FB ROWS GRID */}
      <div className="adm-module" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <h3 className="adm-module-title">Danh sách nick Facebook (bảo mật 2FA)</h3>
            <p className="adm-module-subtitle">Thêm / Sửa / Gửi báo cáo — dữ liệu sẽ được đóng băng khi gửi</p>
          </div>
          <button type="button" className="adm-btn-primary" onClick={addRow}>
            <Plus size={14} /> Thêm dòng
          </button>
        </div>

        {loadingRows ? (
          <div className="adm-empty">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="adm-empty">Chưa có nick nào hôm nay. Bấm "Thêm dòng" hoặc dán dữ liệu thô bên dưới.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>FB UID</th>
                  <th style={thStyle}>Tên TK</th>
                  <th style={thStyle}><KeyRound size={11} style={{ verticalAlign: -1 }} /> 2FA Key</th>
                  <th style={thStyle}>Trạng thái</th>
                  <th style={thStyle}>Nhóm</th>
                  <th style={thStyle}>Bài hôm nay</th>
                  <th style={thStyle}>Cờ</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const validUid = FB_UID_RE.test(row.fb_uid.trim());
                  const frozen = !!row.is_submitted;
                  const editing = !!row._editing && !frozen;
                  return (
                    <tr
                      key={row.id ?? `new-${i}`}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        background: frozen ? "linear-gradient(90deg, rgba(251,191,36,.06), rgba(251,191,36,.02))" : undefined,
                        opacity: frozen ? 0.85 : 1,
                      }}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {frozen ? <Lock size={14} color="#fbbf24" /> :
                            validUid ? <CheckCircle2 size={16} color="#34d399" /> : <XCircle size={16} color="#ef4444" />}
                          {editing ? (
                            <input className="adm-input" value={row.fb_uid}
                              onChange={(e) => updateRow(i, { fb_uid: e.target.value })}
                              placeholder="100012345678" style={{ minWidth: 140 }} />
                          ) : (
                            <span style={{ fontFamily: "monospace" }}>{row.fb_uid}</span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {editing ? (
                          <input className="adm-input" value={row.account_name}
                            onChange={(e) => updateRow(i, { account_name: e.target.value })}
                            placeholder="Tên nick" />
                        ) : (row.account_name || <span style={{ opacity: 0.4 }}>—</span>)}
                      </td>
                      <td style={tdStyle}>
                        {editing ? (
                          <input className="adm-input" value={row.twofa_key}
                            onChange={(e) => updateRow(i, { twofa_key: e.target.value })}
                            placeholder="JBSWY3DPEHPK3PXP" style={{ minWidth: 160, fontFamily: "monospace" }} />
                        ) : row.twofa_key ? (
                          <span style={{ fontFamily: "monospace", fontSize: ".75rem", color: "#fbbf24" }}>
                            {frozen ? "••••••••" : row.twofa_key}
                          </span>
                        ) : (<span style={{ opacity: 0.4 }}>—</span>)}
                      </td>
                      <td style={tdStyle}>
                        {editing ? (
                          <select className="adm-input" value={row.status}
                            onChange={(e) => updateRow(i, { status: e.target.value as "live" | "die" })}>
                            <option value="live">Live</option>
                            <option value="die">Die</option>
                          </select>
                        ) : (
                          <span className="adm-badge" style={{
                            background: row.status === "live" ? "rgba(52,211,153,.15)" : "rgba(239,68,68,.15)",
                            color: row.status === "live" ? "#34d399" : "#fca5a5",
                            border: `1px solid ${row.status === "live" ? "rgba(52,211,153,.4)" : "rgba(239,68,68,.4)"}`,
                            padding: "2px 8px", borderRadius: 999, fontSize: ".72rem", fontWeight: 700,
                          }}>{row.status === "live" ? "● Live" : "✕ Die"}</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {editing ? (
                          <input className="adm-input" type="number" min={0} value={row.groups_count}
                            onChange={(e) => updateRow(i, { groups_count: Number(e.target.value) })} style={{ width: 80 }} />
                        ) : (row.groups_count)}
                      </td>
                      <td style={tdStyle}>
                        {editing ? (
                          <input className="adm-input" type="number" min={0} value={row.posts_today}
                            onChange={(e) => updateRow(i, { posts_today: Number(e.target.value) })} style={{ width: 80 }} />
                        ) : (row.posts_today)}
                      </td>
                      <td style={tdStyle}>
                        {frozen ? (
                          <span style={{
                            padding: "2px 8px", borderRadius: 999, fontSize: ".7rem", fontWeight: 700,
                            background: "rgba(251,191,36,.18)", color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,.5)",
                            display: "inline-flex", alignItems: "center", gap: 4,
                          }}><Lock size={10} /> Đã đóng băng</span>
                        ) : row._historical ? (
                          <span style={{
                            padding: "2px 8px", borderRadius: 999, fontSize: ".7rem", fontWeight: 700,
                            background: "rgba(251,191,36,.15)", color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,.4)",
                          }}>Nick cũ từ hôm qua</span>
                        ) : (<span style={{ opacity: 0.4, fontSize: ".75rem" }}>Mới</span>)}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {frozen ? (
                            <span title="Chỉ Admin 1 có thể chỉnh sửa" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#fbbf24", fontSize: ".72rem" }}>
                              <ShieldCheck size={14} /> Khoá
                            </span>
                          ) : (
                            <>
                              {editing ? (
                                <button type="button" className="adm-btn-ghost"
                                  onClick={() => saveRow(i)} title="Lưu nháp"
                                  style={{ padding: "6px 10px" }}>
                                  <Save size={14} />
                                </button>
                              ) : (
                                <button type="button" className="adm-btn-ghost"
                                  onClick={() => updateRow(i, { _editing: true })} title="Sửa">
                                  <Pencil size={14} />
                                </button>
                              )}
                              <button type="button"
                                onClick={() => saveRow(i, { submit: true })}
                                title="Bấm gửi báo cáo (đóng băng)"
                                style={{
                                  background: "linear-gradient(135deg, #10b981, #059669)",
                                  border: "1px solid rgba(16,185,129,.6)",
                                  color: "#fff", borderRadius: 8, padding: "6px 10px",
                                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                                  boxShadow: "0 0 12px rgba(16,185,129,.45)",
                                }}>
                                <Check size={14} />
                              </button>
                              <button type="button" className="adm-btn-ghost"
                                onClick={() => deleteRow(i)} title="Xoá"
                                style={{ color: "#fca5a5" }}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* BULK RAW IMPORT */}
        <div style={{ display: "grid", gap: 8, marginTop: 6, padding: 14, borderRadius: 14,
          background: "linear-gradient(135deg, rgba(8,12,20,.7), rgba(15,8,20,.7))",
          border: "1px dashed rgba(251,191,36,.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} color="#fbbf24" />
            <span className="adm-label" style={{ color: "#fde68a" }}>
              Dữ liệu thô tài khoản mới mua
            </span>
          </div>
          <p style={{ margin: 0, fontSize: ".75rem", color: "#98a2b3" }}>
            Mỗi dòng 1 tài khoản, format: <code style={{ color: "#fbbf24" }}>Username|Password|2FA|Gmail</code>
          </p>
          <textarea
            className="adm-textarea"
            value={rawBulk}
            onChange={(e) => setRawBulk(e.target.value)}
            placeholder={"100012345678|MatKhau123|JBSWY3DPEHPK3PXP|recovery@gmail.com\n100098765432|Pass456|KRSXG5DJNZTGS2A|backup@gmail.com"}
            rows={5}
            style={{ fontFamily: "monospace", fontSize: ".82rem" }}
          />
          <div>
            <button type="button" onClick={handleBulkImport} disabled={importing || !rawBulk.trim()}
              className="adm-btn-primary"
              style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#1a1208", border: "1px solid rgba(251,191,36,.6)" }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {importing ? "Đang nhập…" : "Nhập hàng loạt"}
            </button>
          </div>
        </div>
      </div>

      {/* ZALO + NOTES SUMMARY SUBMIT */}
      <form onSubmit={handleSubmitSummary} className="adm-module" style={{ display: "grid", gap: 14 }}>
        <div>
          <h3 className="adm-module-title">Tóm tắt Zalo &amp; ghi chú</h3>
          <p className="adm-module-subtitle">Số thành viên Zalo kéo được hôm nay + note tự do</p>
        </div>

        <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
          <span className="adm-label">Số thành viên Zalo kéo được</span>
          <input className="adm-input" type="number" min={0}
            value={zaloCount} onChange={(e) => setZaloCount(Number(e.target.value))} placeholder="0" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="adm-label">Ghi chú (tuỳ chọn)</span>
          <textarea className="adm-textarea" value={notes}
            onChange={(e) => setNotes(e.target.value)} placeholder="Vướng mắc, đề xuất…" />
        </label>

        {msg && (
          <div style={{
            padding: "10px 12px", borderRadius: 10, fontSize: ".85rem",
            display: "inline-flex", gap: 8, alignItems: "center",
            background: msg.ok ? "rgba(222,255,154,.15)" : "rgba(239,68,68,.15)",
            color: msg.ok ? "var(--adm-neon)" : "#fca5a5",
            border: `1px solid ${msg.ok ? "rgba(222,255,154,.4)" : "rgba(239,68,68,.4)"}`,
          }}>
            {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {msg.text}
          </div>
        )}

        <div>
          <button type="submit" className="adm-btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Đang gửi…" : "Gửi báo cáo tổng hợp"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function PremiumProgress({
  icon: Icon, label, current, target, rewardTitle, rewardText, accent, accent2,
}: {
  icon: any; label: string; current: number; target: number;
  rewardTitle: string; rewardText: string; accent: string; accent2: string;
}) {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  const reached = current >= target;
  return (
    <div style={{
      position: "relative", padding: 18, borderRadius: 18,
      background: "linear-gradient(135deg, rgba(12,8,2,.85), rgba(20,16,8,.75))",
      border: `1px solid ${accent}55`,
      boxShadow: `inset 0 0 24px ${accent}22, 0 8px 30px rgba(0,0,0,.45)`,
      overflow: "hidden",
    }}>
      {/* Decorative corner glow */}
      <div style={{
        position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}33, transparent 70%)`, pointerEvents: "none",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center",
            background: `linear-gradient(135deg, ${accent}33, ${accent2}22)`,
            border: `1px solid ${accent}55`,
          }}>
            <Icon size={18} color={accent} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: ".95rem", letterSpacing: ".01em" }}>{label}</div>
            <div style={{ fontSize: ".7rem", color: "#98a2b3", textTransform: "uppercase", letterSpacing: ".08em" }}>Tiến độ thời gian thực</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 900, color: accent, fontSize: "1.4rem", lineHeight: 1, textShadow: `0 0 12px ${accent}66` }}>
            {current.toLocaleString("vi-VN")}
          </div>
          <div style={{ fontSize: ".72rem", color: "#98a2b3" }}>/ {target.toLocaleString("vi-VN")} mục tiêu</div>
        </div>
      </div>

      <div style={{
        height: 18, borderRadius: 999, position: "relative", overflow: "hidden",
        background: "linear-gradient(180deg, rgba(0,0,0,.55), rgba(255,255,255,.03))",
        border: `1px solid ${accent}33`,
        boxShadow: `inset 0 2px 4px rgba(0,0,0,.6)`,
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${accent2}, ${accent}, #fff8d6, ${accent})`,
          backgroundSize: "200% 100%",
          animation: reached ? "premium-shimmer 2s linear infinite" : "premium-shimmer 4s linear infinite",
          boxShadow: `0 0 18px ${accent}cc, inset 0 1px 0 rgba(255,255,255,.4)`,
          transition: "width .6s cubic-bezier(.4,0,.2,1)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,.35) 0%, transparent 50%)",
          }} />
        </div>
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          fontSize: ".72rem", fontWeight: 800, color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,.8)", letterSpacing: ".04em",
        }}>{pct.toFixed(1)}%</div>
      </div>

      <div style={{
        marginTop: 12, padding: "10px 12px", borderRadius: 10,
        background: `linear-gradient(135deg, ${accent}18, ${accent2}10)`,
        border: `1px solid ${accent}44`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Trophy size={16} color={accent} />
        <div>
          <div style={{ fontSize: ".7rem", color: accent, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {rewardTitle}
          </div>
          <div style={{ fontSize: ".82rem", color: "#fde68a", fontWeight: 600 }}>{rewardText}</div>
        </div>
      </div>

      <style>{`
        @keyframes premium-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function AssignmentCard({ label, current, target, accent }:
  { label: string; current: number; target: number; accent: string }) {
  const pct = Math.min(100, (current / target) * 100);
  const done = current >= target;
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "linear-gradient(135deg, rgba(255,255,255,.03), rgba(255,255,255,.01))",
      border: `1px solid ${done ? "#34d39955" : accent + "33"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: ".78rem", color: "#98a2b3", fontWeight: 600 }}>{label}</span>
        <span style={{ fontWeight: 800, color: done ? "#34d399" : accent }}>
          {current}/{target}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.4)", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: done
            ? "linear-gradient(90deg, #10b981, #34d399)"
            : `linear-gradient(90deg, ${accent}, ${accent}aa)`,
          boxShadow: `0 0 10px ${done ? "#34d39988" : accent + "66"}`,
          transition: "width .4s ease",
        }} />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".04em", color: "#98a2b3" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginTop: 2 }}>
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: ".85rem", minWidth: 880,
};
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 10px", fontSize: ".72rem",
  textTransform: "uppercase", letterSpacing: ".04em", color: "#98a2b3",
  borderBottom: "1px solid rgba(255,255,255,.08)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px", verticalAlign: "middle",
};
