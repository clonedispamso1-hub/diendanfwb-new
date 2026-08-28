import { useCallback, useEffect, useState } from "react";
import { Ban, RefreshCw, ShieldOff, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  restrictionsService,
  KIND_LABELS,
  DURATION_LABELS,
  RESTRICTION_DURATIONS,
  formatRemaining,
  type DurationKey,
  type RestrictionKind,
  type RestrictionRow,
} from "@/services/restrictions.service";

const KINDS: RestrictionKind[] = ["suspend", "post", "comment", "like", "message", "find_zalo"];
const DURATIONS: DurationKey[] = RESTRICTION_DURATIONS;

interface Props {
  userId: string;
  onChanged?: () => void;
}

/**
 * Admin sub-panel: apply / revoke / change duration for account restrictions.
 * Uses the currently signed-in admin session (admin RLS policies enforce access).
 */
export function RestrictionPanel({ userId, onChanged }: Props) {
  const [rows, setRows] = useState<RestrictionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<RestrictionKind>("post");
  const [duration, setDuration] = useState<DurationKey>("24h");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await restrictionsService.listForUser(userId, "all");
      setRows(list);
    } catch (e: any) {
      toast.error("Không tải được hạn chế: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const active = rows.filter((r) => !r.revoked_at && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()));
  const history = rows.filter((r) => !active.includes(r));

  const apply = async () => {
    try {
      await restrictionsService.applyRestriction({ userId, kind, duration, reason: reason.trim() || undefined });
      toast.success(`Đã áp dụng: ${KIND_LABELS[kind]} · ${DURATION_LABELS[duration]}`);
      setReason("");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error("Không áp dụng được: " + (e?.message || e));
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Gỡ hạn chế này?")) return;
    try {
      await restrictionsService.revokeRestriction(id);
      toast.success("Đã gỡ hạn chế");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const changeDuration = async (id: string) => {
    const opts = DURATIONS.map((d, i) => `${i + 1}. ${DURATION_LABELS[d]}`).join("\n");
    const idx = window.prompt(`Chọn thời hạn mới:\n${opts}`, "1");
    if (!idx) return;
    const d = DURATIONS[Math.max(0, Math.min(DURATIONS.length - 1, Number(idx) - 1))];
    if (!d) return;
    try {
      await restrictionsService.updateDuration(id, d);
      toast.success(`Đã đổi thời hạn → ${DURATION_LABELS[d]}`);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <div className="admv3-card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          <ShieldOff size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Hạn chế tài khoản
        </h3>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={12} /> Tải lại
        </button>
      </div>

      {/* Apply form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
          Loại hạn chế
          <select value={kind} onChange={(e) => setKind(e.target.value as RestrictionKind)} className="admv3-input">
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
          Thời hạn
          <select value={duration} onChange={(e) => setDuration(e.target.value as DurationKey)} className="admv3-input">
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{DURATION_LABELS[d]}</option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ display: "flex", flexDirection: "column", fontSize: 12, marginBottom: 10 }}>
        Lý do (tuỳ chọn)
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Spam nhiều lần" className="admv3-input" />
      </label>
      <button className="admv3-btn admv3-btn-primary" onClick={() => void apply()} style={{ marginBottom: 14 }}>
        <Ban size={13} /> Áp dụng hạn chế
      </button>

      {/* Active list */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.75 }}>
          Đang áp dụng ({active.length})
        </div>
        {active.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>Không có hạn chế đang hiệu lực.</div>}
        {active.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "rgba(255,80,80,0.08)", borderRadius: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{KIND_LABELS[r.kind]}</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              <Clock size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
              {formatRemaining(r.expires_at)}
            </span>
            {r.reason && <span style={{ fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>· {r.reason}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button className="admv3-icon-btn" title="Đổi thời hạn" onClick={() => void changeDuration(r.id)}>
                <Clock size={13} />
              </button>
              <button className="admv3-icon-btn" title="Gỡ hạn chế" onClick={() => void revoke(r.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.75 }}>
          Lịch sử ({history.length})
        </div>
        {history.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>Chưa có lịch sử.</div>}
        {history.slice(0, 20).map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", fontSize: 12, opacity: 0.75 }}>
            <span>{KIND_LABELS[r.kind]}</span>
            <span>·</span>
            <span>{new Date(r.created_at).toLocaleDateString("vi-VN")}</span>
            <span style={{ marginLeft: "auto" }}>
              {r.revoked_at ? "Đã gỡ" : "Hết hạn"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}