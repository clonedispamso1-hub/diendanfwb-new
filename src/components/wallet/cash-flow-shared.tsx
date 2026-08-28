/**
 * Cash Flow — phần dùng chung cho 3 trang lịch sử (rút / chuyển / nhận).
 * CHỈ TRÌNH BÀY + đọc dữ liệu qua RPC `my_cash_flow` (giữ nguyên logic SB1).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deriveUid } from "@/lib/user-uid";
import { avatarSrc } from "@/lib/image-cdn";
import { formatNumber } from "@/lib/format";

export type WdStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "refunded"
  | "cancel_requested"
  | "cancelled";

export type WdRow = {
  id: string;
  code: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: WdStatus;
  created_at: string;
  bankName: string | null;
  bankAccount: string | null;
  accountHolder: string | null;
  cancelRequestedAt: string | null;
};

export type CashRow =
  | { kind: "withdraw"; id: string; created_at: string; wd: WdRow }
  | {
      kind: "transfer_out" | "transfer_in";
      id: string;
      created_at: string;
      code: string | null;
      amount: number;
      note: string | null;
      counterpartyId: string | null;
      counterpartyName: string | null;
      counterpartyUid: string | null;
      counterpartyAvatar?: string | null;
    };

export const WD_STATUS: Record<WdStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "⏳ Chờ duyệt", color: "#b45309", bg: "#fff7ed" },
  approved: { label: "✅ Thành công", color: "#047857", bg: "#ecfdf5" },
  rejected: { label: "❌ Từ chối", color: "#b91c1c", bg: "#fef2f2" },
  refunded: { label: "🔄 Đã hoàn tiền", color: "#4f46e5", bg: "#eef2ff" },
  cancel_requested: { label: "🛑 Đang huỷ", color: "#c2410c", bg: "#fff7ed" },
  cancelled: { label: "🚫 Đã huỷ — đã hoàn xu", color: "#4f46e5", bg: "#eef2ff" },
};

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  if (yesterday) return `Hôm qua ${hm}`;
  return d.toLocaleDateString("vi-VN") + " " + hm;
}

export function formatElapsed(iso: string, nowMs: number) {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "";
  const s = Math.max(0, Math.floor((nowMs - start) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} ngày ${h} giờ trước`;
  if (h > 0) return `${h} giờ ${m} phút trước`;
  if (m > 0) return `${m} phút trước`;
  return "vừa xong";
}

/** Che số tài khoản — chỉ hiện 4 số cuối. */
export function maskAccount(acc: string | null | undefined): string {
  const v = (acc ?? "").toString().trim();
  if (!v) return "—";
  if (v.length <= 4) return v;
  return "•".repeat(Math.min(8, v.length - 4)) + v.slice(-4);
}

type FlowRow = {
  kind: "withdraw" | "transfer_out" | "transfer_in";
  id: string;
  code: string | null;
  amount: number;
  fee: number;
  net_amount: number;
  status: string;
  note: string | null;
  created_at: string;
  bank_name?: string | null;
  bank_account?: string | null;
  account_holder?: string | null;
  cancel_requested_at?: string | null;
  counterparty_id?: string | null;
  counterparty_name?: string | null;
  counterparty_public_id?: string | null;
};

/** Đọc dòng tiền 3 ngày gần nhất (RPC giữ nguyên). */
export function useCashFlow() {
  const [rows, setRows] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await (supabase as any).rpc("my_cash_flow", { p_days: 3 });
      if (e) throw e;
      const list = ((data as FlowRow[] | null) ?? []).map<CashRow>((r) =>
        r.kind === "withdraw"
          ? {
              kind: "withdraw",
              id: r.id,
              created_at: r.created_at,
              wd: {
                id: r.id,
                code: r.code ?? "",
                amount: Number(r.amount ?? 0),
                fee: Number(r.fee ?? 0),
                net_amount: Number(r.net_amount ?? 0),
                status: r.status as WdStatus,
                created_at: r.created_at,
                bankName: r.bank_name ?? null,
                bankAccount: r.bank_account ?? null,
                accountHolder: r.account_holder ?? null,
                cancelRequestedAt: r.cancel_requested_at ?? null,
              },
            }
          : {
              kind: r.kind,
              id: r.id,
              created_at: r.created_at,
              code: r.code ?? null,
              amount: Number(r.amount ?? 0),
              note: r.note ?? null,
              counterpartyId: r.counterparty_id ?? null,
              counterpartyName: r.counterparty_name ?? null,
              counterpartyUid:
                r.counterparty_public_id ?? (r.counterparty_id ? deriveUid(r.counterparty_id) : null),
              counterpartyAvatar: null,
            },
      );

      // Bổ sung avatar đối tác (chỉ để hiển thị).
      const ids = Array.from(
        new Set(
          list
            .filter((r) => r.kind !== "withdraw")
            .map((r) => (r as any).counterpartyId as string | null)
            .filter(Boolean) as string[],
        ),
      );
      if (ids.length) {
        try {
          const { data: ps } = await (supabase as any)
            .from("profiles")
            .select("id, avatar")
            .in("id", ids);
          const map = new Map<string, string | null>(
            ((ps as any[]) ?? []).map((p) => [p.id, p.avatar ?? null]),
          );
          for (const r of list) {
            if (r.kind !== "withdraw" && r.counterpartyId) {
              r.counterpartyAvatar = map.get(r.counterpartyId) ?? null;
            }
          }
        } catch {
          /* avatar là tuỳ chọn */
        }
      }

      setRows(list);
    } catch (err: any) {
      setRows([]);
      setError(err?.message ? `Không tải được dòng tiền: ${err.message}` : "Không tải được dòng tiền.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}

export function useNowTick(ms = 30_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return nowMs;
}

export function Field({
  label,
  value,
  mono,
  tone,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="cf-field">
      <span className="cf-field-label">{label}</span>
      <span
        className={`cf-field-value${mono ? " is-mono" : ""}${strong ? " is-strong" : ""}`}
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function WithdrawCard({
  r,
  nowMs,
  onCancel,
  cancelling,
}: {
  r: WdRow;
  nowMs: number;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const st = WD_STATUS[r.status] ?? WD_STATUS.pending;
  return (
    <li className="cf-card">
      <div className="cf-card-head">
        <span className="cf-code">
          Mã đơn <b>{r.code || r.id.slice(0, 8)}</b>
        </span>
        <span className="cf-status" style={{ color: st.color, background: st.bg }}>
          {st.label}
        </span>
      </div>

      <div className="cf-grid">
        <Field label="Số xu rút" value={`${formatNumber(r.amount)} xu`} />
        <Field label="Phí" value={`${formatNumber(r.fee)} xu`} />
        <Field label="Thực nhận" value={`${formatNumber(r.net_amount)} xu`} strong tone="#7c3aed" />
        <Field label="Ngân hàng" value={r.bankName || "—"} />
        <Field label="Số tài khoản" value={maskAccount(r.bankAccount)} mono />
        <Field label="Chủ tài khoản" value={r.accountHolder || "—"} />
      </div>

      <div className="cf-foot">
        <span className="cf-time">
          {formatWhen(r.created_at)} · {formatElapsed(r.created_at, nowMs)}
        </span>
        {r.status === "pending" ? (
          <button type="button" className="cf-cancel" disabled={cancelling} onClick={() => onCancel(r.id)}>
            {cancelling ? "Đang gửi…" : "Hủy đơn"}
          </button>
        ) : null}
      </div>

      {r.status === "cancel_requested" ? (
        <div className="cf-hint">Đã nhận yêu cầu huỷ — hệ thống sẽ hoàn xu sau 5 phút.</div>
      ) : null}
    </li>
  );
}

export function TransferCard({
  row,
  nowMs,
}: {
  row: Extract<CashRow, { kind: "transfer_out" | "transfer_in" }>;
  nowMs: number;
}) {
  const incoming = row.kind === "transfer_in";
  const name = row.counterpartyName || "Thành viên";
  return (
    <li className="cf-card">
      <div className="cf-card-head">
        <span className="cf-code">
          Mã giao dịch <b>{row.code || row.id.slice(0, 8)}</b>
        </span>
        <span className="cf-amount" style={{ color: incoming ? "#047857" : "#b91c1c" }}>
          {incoming ? "+" : "−"} {formatNumber(row.amount)} xu
        </span>
      </div>

      <div className="cf-person">
        {row.counterpartyAvatar ? (
          <img
            className="cf-avatar"
            src={avatarSrc(row.counterpartyAvatar, 44)}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="cf-avatar cf-avatar-fallback">{name.trim().charAt(0) || "?"}</span>
        )}
        <div className="cf-person-main">
          <div className="cf-person-name">{name}</div>
          <div className="cf-person-uid">
            {incoming ? "Người gửi" : "Người nhận"} · UID {row.counterpartyUid || "—"}
          </div>
        </div>
      </div>

      <div className="cf-grid">
        <Field label="Số xu" value={`${formatNumber(row.amount)} xu`} strong tone={incoming ? "#047857" : "#b91c1c"} />
        <Field label="Ghi chú" value={row.note || "—"} />
      </div>

      <div className="cf-foot">
        <span className="cf-time">
          {formatWhen(row.created_at)} · {formatElapsed(row.created_at, nowMs)}
        </span>
      </div>
    </li>
  );
}
