import { avatarSrc } from "@/lib/image-cdn";
/**
 * Admin V3 — 💳 Yêu cầu rút tiền.
 * Danh sách yêu cầu + Duyệt / Từ chối (từ chối sẽ hoàn xu cho user).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/format";
import "@/styles/admin-stats-v4.css";

const sb: any = supabase;

type Row = {
  id: string;
  code: string;
  user_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  bank_name: string;
  bank_account: string;
  account_holder: string;
  status: "pending" | "approved" | "rejected" | "refunded";
  created_at: string;
};
type Prof = { id: string; full_name: string | null; public_id: string | number | null; avatar: string | null };

const STATUS_LABEL: Record<Row["status"], string> = {
  pending: "⏳ Chờ duyệt",
  approved: "✅ Thành công",
  rejected: "❌ Từ chối",
  refunded: "🔄 Đã hoàn tiền",
};


export function WithdrawalRequestsManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profs, setProfs] = useState<Record<string, Prof>>({});
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState("");
  const [status, setStatus] = useState<"" | Row["status"]>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_list_withdrawal_requests", {
        p_status: status || null,
      });
      if (error) throw error;
      const list: Row[] = data || [];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      if (ids.length) {
        const { data: ps } = await sb
          .from("profiles")
          .select("id, full_name, public_id, avatar")
          .in("id", ids);
        const map: Record<string, Prof> = {};
        (ps || []).forEach((p: Prof) => { map[p.id] = p; });
        setProfs(map);
      }
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, approve: boolean) => {
    try {
      const { error } = await sb.rpc("review_withdrawal_request", {
        p_id: id,
        p_approve: approve,
        p_note: null,
      });
      if (error) throw error;
      toast.success(approve ? "Đã duyệt yêu cầu" : "Đã từ chối và hoàn xu");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "Thao tác thất bại");
    }
  };

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const p = profs[r.user_id];
      return `${r.code} ${r.account_holder} ${r.bank_account} ${p?.full_name ?? ""} ${p?.public_id ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, kw, profs]);

  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">💳 Yêu cầu rút tiền</h2>
          <p className="sv4-sub">Duyệt hoặc từ chối yêu cầu rút xu của thành viên</p>
        </div>
        <div className="sv4-tools">
          <div className="sv4-search">
            <Search size={14} />
            <input
              placeholder="Tìm mã / tên / STK…"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            style={{ borderRadius: 10, padding: "6px 10px" }}
          >
            <option value="">Tất cả</option>
            <option value="pending">⏳ Đang chờ</option>
            <option value="approved">✅ Đã duyệt</option>
            <option value="rejected">❌ Đã từ chối</option>
            <option value="refunded">🔄 Đã hoàn tiền</option>

          </select>
          <button className="sv4-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> Tải lại
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="sv4-table" style={{ minWidth: 1040 }}>
          <thead>
            <tr>
              <th>Mã</th>
              <th>UID</th>
              <th>Thành viên</th>
              <th>Số xu</th>
              <th>Phí</th>
              <th>Thực nhận</th>
              <th>Ngân hàng</th>
              <th>STK</th>
              <th>Chủ tài khoản</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const p = profs[r.user_id];
              return (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{r.code}</td>
                  <td>{p?.public_id ?? r.user_id.slice(0, 8)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p?.avatar ? (
                        <img
                          src={avatarSrc(p.avatar, 64)}
                          alt=""
                          loading="lazy"
                          width={28}
                          height={28}
                          style={{ borderRadius: 999, objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(139,92,246,0.25)", display: "grid", placeItems: "center" }}>
                          {(p?.full_name || "?")[0]}
                        </span>
                      )}
                      <span>{p?.full_name || "—"}</span>
                    </div>
                  </td>
                  <td>{formatNumber(r.amount)}</td>
                  <td>{formatNumber(r.fee)}</td>
                  <td style={{ fontWeight: 700 }}>{formatNumber(r.net_amount)}</td>
                  <td>{r.bank_name}</td>
                  <td>{r.bank_account}</td>
                  <td>{r.account_holder}</td>
                  <td>{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                  <td>{STATUS_LABEL[r.status]}</td>
                  <td>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="sv4-btn" onClick={() => void review(r.id, true)}>
                          <Check size={14} /> Duyệt
                        </button>
                        <button className="sv4-btn" onClick={() => void review(r.id, false)}>
                          <X size={14} /> Từ chối
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!filtered.length && !loading ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: 24, opacity: 0.7 }}>
                  Chưa có yêu cầu nào
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default WithdrawalRequestsManager;
