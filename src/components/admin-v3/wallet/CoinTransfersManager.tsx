/**
 * Admin V5.5 — Quản lý chuyển xu (transfer_transactions).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/admin-stats-v4.css";

const sb: any = supabase;

type Row = {
  id: string;
  sender_id: string; receiver_id: string;
  sender_public_id: string | null; receiver_public_id: string | null;
  amount: number; fee: number; net_amount: number;
  status: string; created_at: string; claimed_at: string | null;
};
type Prof = { id: string; full_name: string | null; public_id: string | null };

export function CoinTransfersManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profs, setProfs] = useState<Record<string, Prof>>({});
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = sb.from("transfer_transactions")
        .select("id, sender_id, receiver_id, sender_public_id, receiver_public_id, amount, fee, net_amount, status, created_at, claimed_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      const { data } = await q;
      const list: Row[] = data || [];
      setRows(list);
      const ids = Array.from(new Set(list.flatMap((r) => [r.sender_id, r.receiver_id]).filter(Boolean)));
      if (ids.length) {
        const { data: ps } = await sb.from("profiles").select("id, full_name, public_id").in("id", ids);
        const map: Record<string, Prof> = {};
        (ps || []).forEach((p: Prof) => { map[p.id] = p; });
        setProfs(map);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const name = (id: string) => profs[id]?.full_name || `#${profs[id]?.public_id ?? id.slice(0, 8)}`;

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${name(r.sender_id)} ${name(r.receiver_id)} ${r.sender_public_id ?? ""} ${r.receiver_public_id ?? ""}`
        .toLowerCase().includes(q));
  }, [rows, kw, profs]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
    const claimed = filtered.filter((r) => r.status === "claimed").length;
    return { count: filtered.length, total, claimed, pending: filtered.length - claimed };
  }, [filtered]);

  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">Quản lý chuyển xu</h2>
          <p className="sv4-sub">Giao dịch chuyển xu theo Mã thành viên (UID)</p>
        </div>
        <div className="sv4-tools">
          <div className="sv4-search">
            <Search size={14} />
            <input placeholder="Tìm tên / UID…" value={kw} onChange={(e) => setKw(e.target.value)} />
          </div>
          <input type="date" className="sv4-btn" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="sv4-btn" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="sv4-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "sv4-spin" : ""} /> Làm mới
          </button>
        </div>
      </div>

      <section className="sv4-panel" style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
        <Stat label="Giao dịch" value={stats.count.toLocaleString("vi-VN")} />
        <Stat label="Tổng xu" value={`${stats.total.toLocaleString("vi-VN")} 💎`} />
        <Stat label="Đã nhận" value={stats.claimed.toLocaleString("vi-VN")} />
        <Stat label="Chưa nhận" value={stats.pending.toLocaleString("vi-VN")} />
      </section>

      <section className="sv4-panel">
        {loading ? (
          <p className="sv4-empty">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="sv4-empty">Chưa có giao dịch nào.</p>
        ) : (
          <div className="sv4-tablewrap">
            <table className="sv4-table">
              <thead>
                <tr>
                  <th>Người gửi</th><th>UID gửi</th>
                  <th>Người nhận</th><th>UID nhận</th>
                  <th>Số xu</th><th>Thời gian</th><th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{name(r.sender_id)}</td>
                    <td>{r.sender_public_id || "—"}</td>
                    <td>{name(r.receiver_id)}</td>
                    <td>{r.receiver_public_id || "—"}</td>
                    <td className="sv4-amount">{Number(r.amount || 0).toLocaleString("vi-VN")} 💎</td>
                    <td>{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                    <td>{r.status === "claimed" ? "✅ Đã nhận" : r.status === "cancelled" ? "❌ Đã huỷ" : "⏳ Chưa nhận"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
