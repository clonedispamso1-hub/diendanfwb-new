/**
 * Popup chi tiết TÀI KHOẢN VI PHẠM.
 * Hiển thị: UID, nội dung vi phạm, từ khoá khớp, thời gian, số lần vi phạm.
 * Xử lý: cấm độc lập Bình luận / Đăng bài / Nhắn tin theo thời hạn
 * 1h / 3h / 6h / 12h / 24h / 3d / 7d — hết hạn tự mở (enforce ở DB #3).
 */
import { useCallback, useEffect, useState } from "react";
import { Ban, Clock, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  restrictionsService,
  DURATION_LABELS,
  KIND_LABELS,
  RESTRICTION_DURATIONS,
  formatRemaining,
  type DurationKey,
  type RestrictionKind,
  type RestrictionRow,
} from "@/services/restrictions.service";
import {
  keywordModerationService,
  type KeywordOffender,
  type KeywordViolation,
} from "@/services/keyword-moderation.service";

const ACTION_KINDS: RestrictionKind[] = ["comment", "post", "message"];

const CTX_LABEL: Record<string, string> = {
  post: "Bài viết",
  comment: "Bình luận",
  message: "Tin nhắn",
};

export function OffenderDetail({
  offender,
  onClose,
}: {
  offender: KeywordOffender;
  onClose: () => void;
}) {
  const [violations, setViolations] = useState<KeywordViolation[]>([]);
  const [restrictions, setRestrictions] = useState<RestrictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<DurationKey>("24h");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([
        keywordModerationService.listViolations(offender.user_id, 100),
        restrictionsService.listForUser(offender.user_id, "active").catch(() => []),
      ]);
      setViolations(v);
      setRestrictions(r);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [offender.user_id]);

  useEffect(() => { void load(); }, [load]);

  const activeOf = (kind: RestrictionKind) =>
    restrictions.find(
      (r) =>
        r.kind === kind &&
        (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()),
    );

  const apply = async (kind: RestrictionKind) => {
    setBusy(true);
    try {
      await restrictionsService.applyRestriction({
        userId: offender.user_id,
        kind,
        duration,
        reason: reason.trim() || `Vi phạm từ khoá (${offender.violations} lần)`,
      });
      toast.success(`Đã cấm ${KIND_LABELS[kind]} · ${DURATION_LABELS[duration]}`);
      await load();
    } catch (e: any) {
      toast.error("Không áp dụng được: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await restrictionsService.revokeRestriction(id);
      toast.success("Đã gỡ hạn chế");
      await load();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const violationCount = violations.length || offender.violations;

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <div>
            <div className="adm-modal-title">
              {offender.username ? `@${offender.username}` : "Tài khoản vi phạm"}
            </div>
            <div className="adm-modal-sub">
              UID: <code>{offender.user_id}</code>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>

        <div className="adm-modal-body">
          <div className="adm-stat-grid">
            <div className="adm-stat adm-stat-warn">
              <div className="adm-stat-label">Số lần vi phạm</div>
              <div className="adm-stat-value">{violationCount}</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">Từ khoá gần nhất</div>
              <div className="adm-stat-value">{violations[0]?.matched_keyword ?? offender.last_keyword ?? "—"}</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">Lần gần nhất</div>
              <div className="adm-stat-value" style={{ fontSize: "0.85rem" }}>
                {(violations[0]?.created_at ?? offender.last_at)
                  ? new Date(violations[0]?.created_at ?? offender.last_at!).toLocaleString("vi-VN")
                  : "—"}
              </div>
            </div>
          </div>

          {/* ---- Xử lý ---- */}
          <div className="adm-section-title">Xử lý — cấm độc lập từng hành động</div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, marginBottom: 10 }}>
            <select
              className="adm-input"
              value={duration}
              onChange={(e) => setDuration(e.target.value as DurationKey)}
            >
              {RESTRICTION_DURATIONS.map((d) => (
                <option key={d} value={d}>{DURATION_LABELS[d]}</option>
              ))}
            </select>
            <input
              className="adm-input"
              placeholder="Lý do (tuỳ chọn)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="adm-list" style={{ marginBottom: 14 }}>
            {ACTION_KINDS.map((kind) => {
              const act = activeOf(kind);
              return (
                <div key={kind} className="adm-row">
                  <div className="adm-row-main">
                    <div className="adm-row-title">{KIND_LABELS[kind]}</div>
                    <div className="adm-row-meta">
                      {act ? (
                        <span style={{ color: "#f87171" }}>
                          <Clock size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                          Đang cấm · còn {formatRemaining(act.expires_at)}
                        </span>
                      ) : (
                        <span style={{ color: "#4ade80" }}>Bình thường</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="secondary-cta compact"
                    disabled={busy}
                    onClick={() => void apply(kind)}
                  >
                    <Ban size={13} /> Cấm {DURATION_LABELS[duration]}
                  </button>
                  {act ? (
                    <button
                      className="secondary-cta compact danger-button"
                      disabled={busy}
                      title="Gỡ cấm"
                      onClick={() => void revoke(act.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* ---- Nội dung vi phạm ---- */}
          <div className="adm-section-title">
            Nội dung vi phạm
            <button className="icon-button" onClick={() => void load()} style={{ marginLeft: 8 }}>
              <RefreshCw size={13} />
            </button>
          </div>
          {loading ? (
            <div className="adm-empty">Đang tải…</div>
          ) : violations.length === 0 ? (
            <div className="adm-empty">Không có bản ghi vi phạm.</div>
          ) : (
            <div className="adm-list">
              {violations.map((v) => (
                <div key={String(v.id)} className="adm-row">
                  <div className="adm-row-main">
                    <div className="adm-row-title" style={{ whiteSpace: "pre-wrap" }}>
                      {v.content || "(trống)"}
                    </div>
                    <div className="adm-row-meta">
                      <span>
                        Từ khoá: <b style={{ color: "#f87171" }}>{v.matched_keyword}</b>
                      </span>
                      <span>{CTX_LABEL[v.context_type || ""] || v.context_type || "—"}</span>
                      <span>{new Date(v.created_at).toLocaleString("vi-VN")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
