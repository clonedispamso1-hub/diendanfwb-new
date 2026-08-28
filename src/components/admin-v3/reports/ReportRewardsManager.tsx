/**
 * Admin Panel → "🚩 Tố Cáo Nhận Thưởng".
 * Đơn tố cáo nằm ở Supabase #4 (bảng `reports`), thưởng xu cộng vào
 * tài khoản người tố cáo qua RPC `admin_adjust_gem_balance` (Supabase #1).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, RefreshCw, ShieldAlert } from "lucide-react";
import { sb4 } from "@/lib/supabase-v4";
import { supabase } from "@/lib/supabase";

const REWARD = 500000;

interface ReportRow {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  target_uid: string;
  target_name: string | null;
  target_avatar: string | null;
  kind: string;
  reason: string;
  proof_url: string | null;
  status: string;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  post: "Bài viết",
  message: "Tin nhắn",
  profile: "Profile",
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(245,158,11,0.15)", color: "#b45309", label: "Chờ duyệt" },
  approved: { bg: "rgba(34,197,94,0.15)", color: "#15803d", label: "Đã thưởng" },
  rejected: { bg: "rgba(239,68,68,0.15)", color: "#b91c1c", label: "Từ chối" },
};

export function ReportRewardsManager() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb4()
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data ?? []) as ReportRow[]);
    } catch (e: any) {
      toast.error("Không tải được danh sách tố cáo: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (row: ReportRow, status: "approved" | "rejected") => {
    setBusy(row.id);
    try {
      if (status === "approved") {
        const { data, error } = await (supabase as any).rpc("admin_adjust_gem_balance", {
          p_target_user_id: row.reporter_id,
          p_amount: REWARD,
          p_reason: "report_reward_500k",
        });
        if (error) throw error;
        const res = (data || {}) as { ok?: boolean; message?: string; code?: string };
        if (res.ok === false) throw new Error(res.message || res.code || "Cộng xu thất bại");
      }
      const { error: upErr } = await sb4()
        .from("reports")
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw upErr;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      toast.success(status === "approved" ? "Đã duyệt & cộng 500.000 xu." : "Đã từ chối đơn tố cáo.");
    } catch (e: any) {
      toast.error("Thao tác thất bại: " + (e?.message || ""));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldAlert size={18} />
        <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0, flex: 1 }}>Tố Cáo Nhận Thưởng</h3>
        <button type="button" onClick={() => void load()}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 10, padding: "8px 12px", background: "#334155", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {loading ? <div style={{ opacity: 0.6, fontSize: 13 }}>Đang tải…</div> : null}
      {!loading && rows.length === 0 ? <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có đơn tố cáo nào.</div> : null}

      {rows.map((r) => {
        const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
        return (
          <div key={r.id} style={{ border: "1px solid rgba(120,120,140,0.25)", borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <img src={r.target_avatar || "/placeholder.svg"} alt={r.target_name || r.target_uid}
                style={{ width: 40, height: 40, borderRadius: 999, objectFit: "cover" }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.target_name || "Không rõ tên"}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>UID bị tố cáo: {r.target_uid}</div>
              </div>
              <span style={{ ...st, padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: st.bg, color: st.color }}>
                {st.label}
              </span>
            </div>

            <div style={{ fontSize: 12.5, display: "grid", gap: 4 }}>
              <div><b>Người gửi:</b> {r.reporter_name || "—"} <span style={{ opacity: 0.6 }}>({r.reporter_id})</span></div>
              <div><b>Loại vi phạm:</b> {KIND_LABEL[r.kind] || r.kind}</div>
              <div><b>Lý do:</b> {r.reason}</div>
              <div style={{ opacity: 0.6 }}>{new Date(r.created_at).toLocaleString("vi-VN")}</div>
            </div>

            {r.proof_url ? (
              <img src={r.proof_url} alt="Ảnh bằng chứng" onClick={() => setZoom(r.proof_url)}
                style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, cursor: "zoom-in" }} />
            ) : null}

            {r.status === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "approved")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 10, padding: "9px 14px", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  <Check size={14} /> Duyệt & Thưởng 500k
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, "rejected")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 10, padding: "9px 14px", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  <X size={14} /> Từ chối
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {zoom ? (
        <div role="dialog" aria-label="Ảnh bằng chứng" onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, zIndex: 10070, background: "rgba(0,0,0,0.8)", display: "grid", placeItems: "center", padding: 20 }}>
          <button
            type="button"
            aria-label="Đóng"
            onClick={(e) => { e.stopPropagation(); setZoom(null); }}
            style={{
              position: "fixed", top: 16, right: 16, zIndex: 10071,
              width: 44, height: 44, borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(0,0,0,0.55)", color: "#fff", display: "grid", placeItems: "center",
              cursor: "pointer", fontSize: 22, lineHeight: 1,
            }}
          >
            ×
          </button>
          <img src={zoom} alt="Ảnh bằng chứng" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12 }} />
        </div>
      ) : null}
    </div>
  );
}

export default ReportRewardsManager;
