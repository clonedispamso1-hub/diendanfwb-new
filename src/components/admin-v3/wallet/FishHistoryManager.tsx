/**
 * 🐟 Lịch sử Cá — CHỈ ĐỌC lịch sử giao dịch của thành viên.
 *
 * Nguồn dữ liệu (bảng đang có, không tạo bảng mới, không mock):
 *   • Nhận tiền  → transfer_transactions (phía người nhận: receiver_id / to_id)
 *   • Rút tiền   → withdrawal_requests
 * Tên/avatar thành viên đọc từ profiles. Không ghi, không xoá, không duyệt.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/db/router";
import { avatarSrc } from "@/lib/image-cdn";
import { formatNumber } from "@/lib/format";
import { isUuid } from "@/lib/uuid";
import "@/styles/admin-stats-v4.css";

const sb: any = supabase;

type Kind = "transfer_in" | "withdraw";

type Entry = {
  id: string;
  kind: Kind;
  userId: string | null;
  code: string;
  amount: number;
  createdAt: string | null;
  status: string | null;
};

type Prof = {
  id: string;
  full_name: string | null;
  public_id: string | number | null;
  avatar: string | null;
};

const KIND_LABEL: Record<Kind, string> = {
  transfer_in: "📥 Nhận tiền",
  withdraw: "💸 Rút tiền",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ Chờ duyệt",
  approved: "✅ Thành công",
  rejected: "❌ Từ chối",
  refunded: "🔄 Đã hoàn tiền",
  cancelled: "🚫 Đã huỷ",
  canceled: "🚫 Đã huỷ",
  success: "✅ Thành công",
  completed: "✅ Thành công",
};

function statusText(s: string | null, kind: Kind): string {
  if (!s) return kind === "transfer_in" ? "✅ Thành công" : "—";
  return STATUS_LABEL[String(s).toLowerCase()] ?? String(s);
}

function isMissingColumn(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "42703" || code === "PGRST204" || msg.includes("does not exist");
}

/** Đọc transfer_transactions phía người nhận (thử lần lượt các tên cột). */
async function loadTransferIn(limit: number): Promise<Entry[]> {
  for (const col of ["receiver_id", "to_id"]) {
    const { data, error } = await sb
      .from("transfer_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingColumn(error)) continue;
      throw error;
    }
    const rows = (data ?? []) as any[];
    if (rows.length && !(col in rows[0])) continue;
    return rows.map((r) => ({
      id: String(r.id),
      kind: "transfer_in" as const,
      userId: r[col] ? String(r[col]) : null,
      code: String(r.code ?? r.id).slice(0, 10),
      amount: Number(r.amount ?? 0),
      createdAt: r.created_at ?? null,
      status: r.status ?? null,
    }));
  }
  return [];
}

async function loadWithdrawals(limit: number): Promise<Entry[]> {
  const { data, error } = await sb
    .from("withdrawal_requests")
    .select("id, code, user_id, amount, net_amount, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    kind: "withdraw" as const,
    userId: r.user_id ? String(r.user_id) : null,
    code: String(r.code ?? r.id).slice(0, 10),
    amount: Number(r.amount ?? r.net_amount ?? 0),
    createdAt: r.created_at ?? null,
    status: r.status ?? null,
  }));
}

export function FishHistoryManager({
  title = "🐟 Lịch sử Cá",
  subtitle = "Lịch sử Nhận tiền & Rút tiền của thành viên (chỉ xem)",
  limit = 200,
}: { title?: string; subtitle?: string; limit?: number } = {}) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [profs, setProfs] = useState<Record<string, Prof>>({});
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ins, wds] = await Promise.all([
        loadTransferIn(limit).catch(() => [] as Entry[]),
        loadWithdrawals(limit).catch(() => [] as Entry[]),
      ]);
      const all = [...ins, ...wds].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      setRows(all);

      const ids = Array.from(new Set(all.map((r) => r.userId).filter((x): x is string => !!x && isUuid(x))));
      if (ids.length) {
        const { data: ps } = await sb
          .from("profiles")
          .select("id, full_name, public_id, avatar")
          .in("id", ids);
        const map: Record<string, Prof> = {};
        (ps ?? []).forEach((p: Prof) => { map[p.id] = p; });
        setProfs(map);
      } else {
        setProfs({});
      }
    } catch (e: any) {
      console.error("[FishHistoryManager] load error:", e);
      toast.error(e?.message || "Không tải được lịch sử");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!q) return true;
      const p = r.userId ? profs[r.userId] : null;
      if (isUuid(kw.trim()) && r.userId === kw.trim()) return true;
      return `${r.code} ${p?.full_name ?? ""} ${p?.public_id ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, kw, kind, profs]);

  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">{title}</h2>
          <p className="sv4-sub">{subtitle}</p>
        </div>
        <div className="sv4-tools">
          <div className="sv4-search">
            <Search size={14} />
            <input
              placeholder="Tìm mã / tên / UID…"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            style={{ borderRadius: 10, padding: "6px 10px" }}
          >
            <option value="">Tất cả</option>
            <option value="transfer_in">📥 Nhận tiền</option>
            <option value="withdraw">💸 Rút tiền</option>
          </select>
          <button className="sv4-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> Tải lại
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="sv4-table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th>Mã</th>
              <th>UID</th>
              <th>Thành viên</th>
              <th>Loại</th>
              <th>Số Xu</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const p = r.userId ? profs[r.userId] : null;
              return (
                <tr key={`${r.kind}-${r.id}`}>
                  <td style={{ fontFamily: "monospace" }}>{r.code}</td>
                  <td>{p?.public_id ?? (r.userId ? r.userId.slice(0, 8) : "—")}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p?.avatar ? (
                        <img
                          decoding="async"
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
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td style={{ fontWeight: 700, color: r.kind === "transfer_in" ? "#16a34a" : "#dc2626" }}>
                    {r.kind === "transfer_in" ? "+" : "−"}
                    {formatNumber(r.amount)}
                  </td>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                  <td>{statusText(r.status, r.kind)}</td>
                </tr>
              );
            })}
            {!filtered.length && !loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24, opacity: 0.7 }}>
                  Chưa có giao dịch nào
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FishHistoryManager;
