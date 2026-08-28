import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Flag,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import {
  fetchReports,
  fetchProfilesByIds,
  fetchPendingCounts,
  updateReportStatus,
  deleteReport,
  applyAccountBan,
  logAdmin,
  sendUserNotification,
  DURATION_LABEL,
  PENALTY_DURATIONS,
  type ReportKind,
  type ReportStatus,
  type ReportRow,
  type PenaltyDuration,
} from "@/services/reports-v2.service";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/lib/realtime-registry";

type Tab = ReportKind;

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Chờ xử lý",
  reviewing: "Đang xem xét",
  resolved: "Đã xử lý",
  rejected: "Đã từ chối",
};

const STATUS_COLOR: Record<ReportStatus, string> = {
  pending: "#fbbf24",
  reviewing: "#38bdf8",
  resolved: "#22c55e",
  rejected: "#94a3b8",
};

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Vừa xong";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return d.toLocaleString("vi-VN");
}

export function ReportsManagerV2() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>("posts");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<ReportStatus | "all">("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ReportRow | null>(null);
  const [penaltyFor, setPenaltyFor] = useState<ReportRow | null>(null);
  const [counts, setCounts] = useState({ posts: 0, profiles: 0, messages: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const data = (await fetchReports(tab, status)) as ReportRow[];
      const ids = Array.from(
        new Set(
          data.flatMap(
            (r) => [r.reporter_id, r.reported_user_id, r.target_id].filter(Boolean) as string[],
          ),
        ),
      );
      const map = await fetchProfilesByIds(ids);
      setRows(data);
      setProfiles(map);
    } catch (e: any) {
      toast.error("Không tải được báo cáo: " + (e?.message ?? "unknown"));
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const c = await fetchPendingCounts();
      setCounts({ posts: c.posts, profiles: c.profiles, messages: c.messages });
    } catch {
      setCounts({ posts: 0, profiles: 0, messages: 0 });
    }
  };

  useEffect(() => {
    void load();
  }, [tab, status]);

  useEffect(() => {
    void loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    "reports-v2-hub",
    useMemo(() => [{ table: "reports" as const, event: "*" as const }], []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => { void load(); void loadCounts(); }, []),
  );

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    if (!qn) return rows;
    return rows.filter((r) => {
      const rep = profiles[r.reporter_id];
      const tgt = profiles[r.reported_user_id ?? ""];
      return (
        (rep?.username ?? "").toLowerCase().includes(qn) ||
        (tgt?.username ?? "").toLowerCase().includes(qn) ||
        (r.reason ?? "").toLowerCase().includes(qn) ||
        (r.target_id ?? "").toLowerCase().includes(qn)
      );
    });
  }, [rows, q, profiles]);

  const setRowStatus = async (
    r: ReportRow,
    next: ReportStatus,
    extra?: Record<string, unknown>,
  ) => {
    try {
      await updateReportStatus(r.id, next);
      await logAdmin(me?.id ?? "", `report_${next}`, {
        kind: tab,
        report_id: r.id,
        ...(extra ?? {}),
      });
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
      void loadCounts();
      toast.success(`Đã cập nhật: ${STATUS_LABEL[next]}`);
    } catch (e: any) {
      toast.error("Không cập nhật được: " + (e?.message ?? ""));
    }
  };

  const remove = async (r: ReportRow) => {
    if (!confirm("Xóa báo cáo này?")) return;
    try {
      await deleteReport(r.id);
      await logAdmin(me?.id ?? "", "report_deleted", { kind: tab, report_id: r.id });
      setRows((rs) => rs.filter((x) => x.id !== r.id));
      void loadCounts();
      toast.success("Đã xóa báo cáo");
    } catch (e: any) {
      toast.error("Không xóa được: " + (e?.message ?? ""));
    }
  };

  return (
    <div className="rd-page">
      <div className="rd-stats-grid">
        <StatCard icon={Flag} label="Bài viết" value={counts.posts} color="#38bdf8" />
        <StatCard icon={User} label="Hồ sơ" value={counts.profiles} color="#a78bfa" />
        <StatCard icon={MessageSquare} label="Tin nhắn" value={counts.messages} color="#f472b6" />
        <StatCard
          icon={Clock}
          label="Tổng chờ xử lý"
          value={counts.posts + counts.profiles + counts.messages}
          color="#fbbf24"
        />
      </div>

      <div className="rd-subtabs">
        {(["posts", "profiles", "messages"] as Tab[]).map((k) => (
          <button
            key={k}
            className={`rd-subtab ${tab === k ? "is-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {k === "posts" && (
              <>
                <FileText size={14} /> Bài viết
              </>
            )}
            {k === "profiles" && (
              <>
                <User size={14} /> Hồ sơ
              </>
            )}
            {k === "messages" && (
              <>
                <MessageSquare size={14} /> Tin nhắn
              </>
            )}
            {counts[k] > 0 && <span className="rd-pending-dot">{counts[k]}</span>}
          </button>
        ))}
      </div>

      <div className="rd-filter-bar">
        <div className="rd-search">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo username, lý do, ID..."
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="rd-select"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ xử lý</option>
          <option value="reviewing">Đang xem xét</option>
          <option value="resolved">Đã xử lý</option>
          <option value="rejected">Đã từ chối</option>
        </select>
        <button className="rd-btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      <div className="rd-table-wrap">
        <table className="rd-table">
          <thead>
            <tr>
              <th>Người báo cáo</th>
              <th>Người bị báo cáo</th>
              <th>Chi tiết</th>
              <th>Lý do</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th className="rd-col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="rd-empty">
                  {loading ? "Đang tải..." : "Không có báo cáo nào."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const rep = profiles[r.reporter_id];
              const tgt = profiles[r.reported_user_id ?? ""];
              return (
                <tr key={r.id} className="rd-row" onClick={() => setDetail(r)}>
                  <td>
                    <div className="rd-user-inline">{rep?.username || rep?.full_name || "—"}</div>
                    <div className="rd-uid">{r.reporter_id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <div className="rd-user-inline">{tgt?.username || tgt?.full_name || "—"}</div>
                    <div className="rd-uid">{(r.reported_user_id ?? "").slice(0, 8)}…</div>
                  </td>
                  <td>
                    <div className="rd-post-title">
                      {tab === "posts" && (r.target_id ? `Post ${r.target_id.slice(0, 8)}…` : "—")}
                      {tab === "profiles" && "Báo cáo hồ sơ"}
                      {tab === "messages" &&
                        (r.target_id ? `Hội thoại ${r.target_id.slice(0, 8)}…` : "—")}
                    </div>
                  </td>
                  <td className="rd-reason">{r.reason ?? "—"}</td>
                  <td className="rd-time">{relTime(r.created_at)}</td>
                  <td>
                    <span
                      className="rd-badge"
                      style={{
                        color: STATUS_COLOR[r.status],
                        background: STATUS_COLOR[r.status] + "22",
                        borderColor: STATUS_COLOR[r.status] + "55",
                      }}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="rd-actions">
                      <button className="rd-act" onClick={() => setDetail(r)}>
                        <Eye size={13} />
                        <span>Xem</span>
                      </button>
                      {r.status === "pending" && (
                        <button
                          className="rd-act"
                          onClick={() => void setRowStatus(r, "reviewing")}
                        >
                          <Clock size={13} />
                          <span>Xem xét</span>
                        </button>
                      )}
                      <button className="rd-act" onClick={() => void setRowStatus(r, "rejected")}>
                        <CheckCircle2 size={13} />
                        <span>Từ chối</span>
                      </button>
                      <button className="rd-act is-warn" onClick={() => setPenaltyFor(r)}>
                        <Lock size={13} />
                        <span>Xử phạt</span>
                      </button>
                      <button className="rd-act is-danger" onClick={() => void remove(r)}>
                        <Trash2 size={13} />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detail && (
        <DetailModal
          row={detail}
          reporter={profiles[detail.reporter_id]}
          target={profiles[detail.reported_user_id ?? ""]}
          kind={tab}
          onClose={() => setDetail(null)}
        />
      )}

      {penaltyFor && me?.id && (
        <PenaltyDialog
          row={penaltyFor}
          target={profiles[penaltyFor.reported_user_id ?? ""]}
          adminId={me.id}
          kind={tab}
          onClose={() => setPenaltyFor(null)}
          onDone={async () => {
            setPenaltyFor(null);
            await load();
            await loadCounts();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="rd-stat-card" style={{ borderColor: color + "55" }}>
      <div className="rd-stat-icon" style={{ color, background: color + "22" }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="rd-stat-value" style={{ color }}>
          {value}
        </div>
        <div className="rd-stat-label">{label}</div>
      </div>
    </div>
  );
}

function DetailModal({
  row,
  reporter,
  target,
  kind,
  onClose,
}: {
  row: ReportRow;
  reporter: any;
  target: any;
  kind: ReportKind;
  onClose: () => void;
}) {
  return (
    <div className="rd-modal-backdrop" onClick={onClose}>
      <div className="rd-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rd-modal-close" onClick={onClose}>
          <X size={16} />
        </button>
        <h3>Chi tiết báo cáo</h3>
        <div className="rd-detail-grid">
          <div>
            <span className="rd-label">Loại:</span> {kind}
          </div>
          <div>
            <span className="rd-label">Người báo cáo:</span> {reporter?.username || row.reporter_id}
          </div>
          <div>
            <span className="rd-label">Người bị báo cáo:</span>{" "}
            {target?.username || row.reported_user_id}
          </div>
          <div>
            <span className="rd-label">Lý do:</span> {row.reason ?? "—"}
          </div>
          {row.target_id && (
            <div>
              <span className="rd-label">Target ID:</span> {row.target_id}
            </div>
          )}
          <div>
            <span className="rd-label">Thời gian:</span>{" "}
            {new Date(row.created_at).toLocaleString("vi-VN")}
          </div>
          <div>
            <span className="rd-label">Trạng thái:</span> {STATUS_LABEL[row.status]}
          </div>
        </div>
        {row.reason && <div className="rd-detail-content">{row.reason}</div>}
      </div>
    </div>
  );
}

function PenaltyDialog({
  row,
  target,
  adminId,
  kind,
  onClose,
  onDone,
}: {
  row: ReportRow;
  target: any;
  adminId: string;
  kind: ReportKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [duration, setDuration] = useState<PenaltyDuration>(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const targetUserId = row.reported_user_id ?? row.target_id ?? "";

  const submit = async () => {
    if (!targetUserId) {
      toast.error("Báo cáo này không có người bị báo cáo.");
      return;
    }
    setBusy(true);
    try {
      await applyAccountBan(targetUserId, duration, note || `Báo cáo ${kind}`);
      await updateReportStatus(row.id, "resolved");
      await logAdmin(adminId, "apply_account_ban", {
        target_user: targetUserId,
        duration: String(duration),
        report_id: row.id,
        kind,
        note,
      });
      await sendUserNotification(targetUserId, {
        type: "warning",
        title: "⚠️ Tài khoản bị khóa",
        message:
          `Tài khoản của bạn đã bị khóa trong ${DURATION_LABEL[String(duration)]}.` +
          (note ? `\n\nGhi chú: ${note}` : "") +
          `\n\nNếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ hỗ trợ.`,
        relatedId: row.id,
        data: { duration: String(duration), report_id: row.id, report_kind: kind },
      });
      toast.success("Đã áp dụng xử phạt và gửi thông báo");
      onDone();
    } catch (e: any) {
      toast.error("Lỗi: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  const unban = async () => {
    if (!targetUserId) return;
    setBusy(true);
    try {
      await applyAccountBan(targetUserId, null);
      await logAdmin(adminId, "remove_account_ban", {
        target_user: targetUserId,
        report_id: row.id,
      });
      toast.success("Đã mở khóa tài khoản");
      onDone();
    } catch (e: any) {
      toast.error("Lỗi: " + (e?.message ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rd-modal-backdrop" onClick={onClose}>
      <div className="rd-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <button className="rd-modal-close" onClick={onClose}>
          <X size={16} />
        </button>
        <h3>
          <AlertTriangle
            size={18}
            style={{ display: "inline", marginRight: 6, color: "#fbbf24" }}
          />{" "}
          Xử phạt người dùng
        </h3>
        <div className="rd-detail-grid">
          <div>
            <span className="rd-label">Đối tượng:</span> {target?.username || targetUserId}
          </div>
          <div>
            <span className="rd-label">Hình thức:</span>{" "}
            <Lock size={12} style={{ display: "inline" }} /> Khóa tài khoản
          </div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="rd-label">Thời hạn</span>
            <select
              value={String(duration)}
              onChange={(e) =>
                setDuration(
                  e.target.value === "permanent"
                    ? "permanent"
                    : (Number(e.target.value) as PenaltyDuration),
                )
              }
              className="rd-select"
            >
              {PENALTY_DURATIONS.map((d) => (
                <option key={String(d)} value={String(d)}>
                  {DURATION_LABEL[String(d)]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="rd-label">Ghi chú (gửi kèm thông báo)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rd-select"
              placeholder="Vi phạm điều khoản mục X..."
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button className="rd-btn" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="rd-btn" onClick={() => void unban()} disabled={busy}>
            Mở khóa
          </button>
          <button className="rd-btn-danger-lg" onClick={() => void submit()} disabled={busy}>
            {busy ? "Đang xử lý..." : "Xác nhận xử phạt"}
          </button>
        </div>
      </div>
    </div>
  );
}
