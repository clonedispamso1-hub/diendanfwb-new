/**
 * V6 — Trang Rút tiền (/wallet/withdraw). Phong cách Banking App: nền sáng,
 * chữ đậm dễ đọc, bo góc 16px, shadow nhẹ, tính phí + animate số realtime.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markTransfersSeen } from "@/lib/new-transfers";
import { useNavigate } from "react-router-dom";

import { toast } from "sonner";

import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { AppLoading } from "@/components/candy/app-loading";
import { supabase } from "@/lib/supabase";
import { formatNumber, parseDigits } from "@/lib/format";
import { deriveUid } from "@/lib/user-uid";
import { resolveUserName } from "@/lib/user-name";
import { avatarSrc } from "@/lib/image-cdn";
import { useWithdrawConfig, VN_BANKS, normalizeAccountHolder } from "@/lib/withdraw";
import { useCashFlowUnread, type CfSection } from "@/hooks/use-cashflow-unread";
import "@/styles/cashflow.css";


const TransferGemModal = lazy(() =>
  import("@/components/candy/transfer-gem-modal").then((m) => ({ default: m.TransferGemModal })),
);

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#555",
  margin: "16px 0 8px",
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: 16,
  border: "1px solid #e6e4ee",
  background: "#fff",
  color: "#222",
  fontSize: 16,
  fontWeight: 600,
  outline: "none",
  boxShadow: "0 6px 18px -12px rgba(20,10,40,0.35)",
};

/** Đếm số tăng dần mượt (rAF). */
function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 420;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      setDisplay(v);
      fromRef.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

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

const WD_STATUS: Record<WdStatus, { label: string; color: string }> = {
  pending: { label: "Chờ duyệt", color: "#b45309" },
  approved: { label: "Thành công", color: "#047857" },
  rejected: { label: "Từ chối", color: "#b91c1c" },
  refunded: { label: "Đã hoàn tiền", color: "#4f46e5" },
  cancel_requested: { label: "Đang huỷ (hoàn sau 5 phút)", color: "#c2410c" },
  cancelled: { label: "Đã huỷ — đã hoàn xu", color: "#4f46e5" },
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  if (yesterday) return `Hôm qua ${hm}`;
  return d.toLocaleDateString("vi-VN") + " " + hm;
}

/** "2 giờ 5 phút trước" — thời lượng đã trôi qua kể từ lúc tạo. */
function formatElapsed(iso: string, nowMs: number) {
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

/**
 * Một dòng "dòng tiền": rút tiền, chuyển xu đi, nhận xu về.
 * KHÔNG bao gồm quà tặng bài viết (gift) — những giao dịch đó có `post_id`.
 */
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

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ececf3",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 22px -18px rgba(20,10,40,0.5)",
};

function WithdrawCard({
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
    <li style={cardStyle}>
      <div className="cf-card-head">
        <span className="cf-code">
          Mã giao dịch: <b>{r.code || r.id.slice(0, 8)}</b>
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: st.color }}>{st.label}</span>
      </div>

      <div className="cf-sep" />

      <div style={{ display: "grid", gap: 6 }}>
        <div className="cf-row">
          <span className="cf-row-label">Số xu rút</span>
          <span className="cf-amount">{formatNumber(r.amount)} xu</span>
        </div>
        <div className="cf-row">
          <span className="cf-row-label">Phí</span>
          <span className="cf-amount">{formatNumber(r.fee)} xu</span>
        </div>
        <div className="cf-row">
          <span className="cf-row-label">Thực nhận</span>
          <span className="cf-amount" style={{ color: "#7c3aed" }}>
            {formatNumber(r.net_amount)} xu
          </span>
        </div>
      </div>

      <div className="cf-sep" />

      <div style={{ display: "grid", gap: 6 }}>
        <div className="cf-row">
          <span className="cf-row-label">Ngân hàng</span>
          <span className="cf-row-value">{r.bankName || "—"}</span>
        </div>
        <div className="cf-row">
          <span className="cf-row-label">Số tài khoản</span>
          <span className="cf-row-value" style={{ fontFamily: "ui-monospace, monospace" }}>
            {maskAccount(r.bankAccount)}
          </span>
        </div>
        <div className="cf-row">
          <span className="cf-row-label">Chủ tài khoản</span>
          <span className="cf-row-value">{r.accountHolder || "—"}</span>
        </div>
      </div>

      <div className="cf-time">
        {formatWhen(r.created_at)} · {formatElapsed(r.created_at, nowMs)}
      </div>


      {r.status === "pending" ? (
        <button
          type="button"
          className="wd-cancel-btn"
          disabled={cancelling}
          onClick={() => onCancel(r.id)}
        >
          {cancelling ? "Đang huỷ…" : "Hủy đơn rút tiền"}
        </button>
      ) : null}
      {r.status === "cancel_requested" ? (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#c2410c" }}>
          Đã nhận yêu cầu huỷ — hệ thống đang hoàn xu.
        </div>
      ) : null}
    </li>
  );
}

function TransferCard({
  row,
  meName,
  meUid,
  nowMs,
}: {
  row: Extract<CashRow, { kind: "transfer_out" | "transfer_in" }>;
  meName: string;
  meUid: string | null;
  nowMs: number;
}) {
  const incoming = row.kind === "transfer_in";
  const senderName = incoming ? row.counterpartyName || "Thành viên" : meName;
  const senderUid = incoming ? row.counterpartyUid : meUid;
  const receiverName = incoming ? meName : row.counterpartyName || "Thành viên";
  const receiverUid = incoming ? meUid : row.counterpartyUid;
  return (
    <li style={cardStyle}>
      <div className="cf-card-head">
        <span className="cf-code">
          Mã giao dịch: <b>{row.code || row.id.slice(0, 8)}</b>
        </span>
        <span className="cf-amount" style={{ color: incoming ? "#047857" : "#b91c1c" }}>
          {incoming ? "+" : "−"} {formatNumber(row.amount)} xu
        </span>
      </div>

      <div className="cf-person">
        {row.counterpartyAvatar ? (
          <img
            className="cf-avatar"
            /* Dùng lại biến thể 320px đã có sẵn → avatar nét trên màn hình retina,
               không upload ảnh mới, không sinh thêm file trong Storage. */
            src={avatarSrc(row.counterpartyAvatar, 320)}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="cf-avatar cf-avatar-fallback">
            {(incoming ? senderName : receiverName).trim().charAt(0) || "?"}
          </span>
        )}
        <div className="cf-person-main">
          <div className="cf-person-name">{incoming ? senderName : receiverName}</div>
          <div className="cf-person-uid">
            {incoming ? "Người gửi" : "Người nhận"} · UID{" "}
            {(incoming ? senderUid : receiverUid) || "—"}
          </div>
        </div>
      </div>

      <div className="cf-sep" />

      <div style={{ display: "grid", gap: 6 }}>
        <div className="cf-row">
          <span className="cf-row-label">Người gửi</span>
          <span className="cf-row-value">{senderName}</span>
        </div>
        {senderUid ? (
          <div className="cf-row">
            <span className="cf-row-label">UID người gửi</span>
            <span className="cf-row-value" style={{ fontFamily: "ui-monospace, monospace", color: "#7c3aed" }}>
              {senderUid}
            </span>
          </div>
        ) : null}
        <div className="cf-row">
          <span className="cf-row-label">Người nhận</span>
          <span className="cf-row-value">{receiverName}</span>
        </div>
        {receiverUid ? (
          <div className="cf-row">
            <span className="cf-row-label">UID người nhận</span>
            <span className="cf-row-value" style={{ fontFamily: "ui-monospace, monospace", color: "#7c3aed" }}>
              {receiverUid}
            </span>
          </div>
        ) : null}
        {row.note ? (
          <div className="cf-row">
            <span className="cf-row-label">Ghi chú</span>
            <span className="cf-row-value">{row.note}</span>
          </div>
        ) : null}
      </div>

      <div className="cf-time">
        {formatWhen(row.created_at)} · {formatElapsed(row.created_at, nowMs)}
      </div>
    </li>
  );
}

type SectionKey = "withdraw" | "transfer_out" | "transfer_in";

const SECTION_META: Record<SectionKey, { title: string; empty: string }> = {
  withdraw: { title: "Rút tiền", empty: "Chưa có yêu cầu rút tiền." },
  transfer_out: { title: "Chuyển tiền", empty: "Chưa có giao dịch chuyển đi." },
  transfer_in: { title: "Nhận tiền", empty: "Chưa có giao dịch nhận về." },
};

function CashFlowHistory({
  rows,
  loading,
  onReload,
  onCancel,
  cancellingId,
  meName,
  meUid,
  unread,
  markSeen,
}: {
  rows: CashRow[];
  loading: boolean;
  onReload: () => void;
  onCancel: (id: string) => void;
  cancellingId: string | null;
  meName: string;
  meUid: string | null;
  unread: Record<CfSection, boolean>;
  markSeen: (section: CfSection) => void;
}) {
  const [section, setSection] = useState<SectionKey>("withdraw");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Mở đúng tab / xem giao dịch → đánh dấu đã đọc, chấm đỏ biến mất.
  useEffect(() => {
    if (!loading) markSeen(section);
  }, [section, loading, rows, markSeen]);

  const buckets: Record<SectionKey, CashRow[]> = {
    withdraw: rows.filter((r) => r.kind === "withdraw"),
    transfer_out: rows.filter((r) => r.kind === "transfer_out"),
    transfer_in: rows.filter((r) => r.kind === "transfer_in"),
  };

  const confirmRow = confirmId
    ? (buckets.withdraw.find((r) => r.kind === "withdraw" && r.wd.id === confirmId) as
        | Extract<CashRow, { kind: "withdraw" }>
        | undefined)
    : undefined;

  const renderList = (key: SectionKey) => {
    const list = buckets[key];
    if (!list.length) {
      return <div className="cf-empty">{SECTION_META[key].empty}</div>;
    }
    return (
      <ul className="cf-list">
        {list.map((row) =>
          row.kind === "withdraw" ? (
            <WithdrawCard
              key={`wd-${row.id}`}
              r={row.wd}
              nowMs={nowMs}
              onCancel={(id) => setConfirmId(id)}
              cancelling={cancellingId === row.wd.id}
            />
          ) : (
            <TransferCard key={`tx-${row.id}`} row={row} meName={meName} meUid={meUid} nowMs={nowMs} />
          ),
        )}
      </ul>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
        <AppLoading label="Đang tải dòng tiền…" />
      </div>
    );
  }

  return (
    <div className="cf-wrap">
      <div className="cf-notice">
        Các đơn rút tiền sau khi được duyệt sẽ nhận được tiền trong vòng <b>5 - 10 phút</b>.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onReload} className="wd-reload">Tải lại</button>
      </div>

      {/* Tabs: dùng chung cho mobile & desktop */}
      <div className="cf-tabs">
        {(Object.keys(SECTION_META) as SectionKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`cf-tab${section === k ? " is-active" : ""}`}
            onClick={() => setSection(k)}
          >
            {SECTION_META[k].title}
            <span className="cf-count">{buckets[k].length}</span>
            {unread[k] ? <span className="cf-dot" aria-label="Có giao dịch mới" /> : null}
          </button>
        ))}
      </div>
      <div className="cf-mobile-panel">{renderList(section)}</div>

      {confirmRow ? (
        <div
          className="cf-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmId(null)}
        >
          <div className="cf-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="cf-confirm-title">Hủy đơn rút tiền?</div>
            <p className="cf-confirm-text">
              Đơn <b>{confirmRow.wd.code || confirmRow.wd.id.slice(0, 8)}</b> —{" "}
              <b>{formatNumber(confirmRow.wd.amount)} xu</b> sẽ được huỷ và hoàn xu về ví của bạn.
              Hành động này không thể hoàn tác.
            </p>
            <div className="cf-confirm-actions">
              <button type="button" className="cf-confirm-keep" onClick={() => setConfirmId(null)}>
                Giữ đơn
              </button>
              <button
                type="button"
                className="cf-confirm-yes"
                disabled={cancellingId === confirmRow.wd.id}
                onClick={() => {
                  const id = confirmRow.wd.id;
                  setConfirmId(null);
                  onCancel(id);
                }}
              >
                {cancellingId === confirmRow.wd.id ? "Đang huỷ…" : "Xác nhận hủy"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function Cell({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#777", fontWeight: 600 }}>{l}</div>
      <div style={{ fontSize: strong ? 15 : 14, fontWeight: 800, color: strong ? "#7c3aed" : "#222" }}>{value}</div>
    </div>
  );
}

function Inner() {
  // Mở trang Rút tiền / Dòng tiền → badge chuyển tiền trên dock biến mất.
  useEffect(() => { markTransfersSeen(); }, []);


  const navigate = useNavigate();
  const { me, ready, refreshMe } = useAuth();
  const cfg = useWithdrawConfig();
  const balance = Number(me?.gem_balance ?? 0);

  const [amountText, setAmountText] = useState("");
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"create" | "history">("create");
  const [transferOpen, setTransferOpen] = useState(false);
  const [history, setHistory] = useState<CashRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Dòng tiền 3 ngày gần nhất: rút tiền + chuyển xu đi/về (không gồm quà bài viết).
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const { data, error: e } = await (supabase as any).rpc("my_cash_flow", { p_days: 3 });
      if (e) throw e;
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
      const rows = ((data as FlowRow[] | null) ?? []).map<CashRow>((r) =>
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
                status: r.status,
                created_at: r.created_at,
                bankName: r.bank_name ?? null,
                bankAccount: r.bank_account ?? null,
                accountHolder: r.account_holder ?? null,
                cancelRequestedAt: r.cancel_requested_at ?? null,
              } as WdRow,
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
              // Ưu tiên public_id thật; nếu chưa có thì suy ra UID ngắn từ id.
              counterpartyUid:
                r.counterparty_public_id ??
                (r.counterparty_id ? deriveUid(r.counterparty_id) : null),
              counterpartyAvatar: null,
            },
      );

      // Bổ sung thông tin ngân hàng nếu RPC chưa trả đủ (merge từ
      // withdrawal_requests — chỉ đọc, RLS vẫn chỉ cho xem đơn của chính mình).
      const wdIds = rows
        .filter((r) => r.kind === "withdraw" && !(r as any).wd.bankName)
        .map((r) => r.id);
      if (wdIds.length) {
        try {
          const { data: wds } = await (supabase as any)
            .from("withdrawal_requests")
            .select("id, bank_name, bank_account, account_holder, status, cancel_requested_at")
            .in("id", wdIds);
          const map = new Map<string, any>(((wds as any[]) ?? []).map((w) => [w.id, w]));
          for (const r of rows) {
            if (r.kind !== "withdraw") continue;
            const w = map.get(r.id);
            if (!w) continue;
            r.wd.bankName = w.bank_name ?? r.wd.bankName;
            r.wd.bankAccount = w.bank_account ?? r.wd.bankAccount;
            r.wd.accountHolder = w.account_holder ?? r.wd.accountHolder;
            r.wd.cancelRequestedAt = w.cancel_requested_at ?? r.wd.cancelRequestedAt;
          }
        } catch {
          /* thông tin ngân hàng là bổ sung — không làm vỡ lịch sử */
        }
      }

      // Avatar đối tác (chỉ để hiển thị, dùng biến thể ảnh đã có).
      const cpIds = Array.from(
        new Set(
          rows
            .filter((r) => r.kind !== "withdraw")
            .map((r) => (r as any).counterpartyId as string | null)
            .filter(Boolean) as string[],
        ),
      );
      if (cpIds.length) {
        try {
          const { data: ps } = await (supabase as any)
            .from("profiles")
            .select("id, avatar")
            .in("id", cpIds);
          const map = new Map<string, string | null>(
            ((ps as any[]) ?? []).map((p) => [p.id, p.avatar ?? null]),
          );
          for (const r of rows) {
            if (r.kind !== "withdraw" && r.counterpartyId) {
              r.counterpartyAvatar = map.get(r.counterpartyId) ?? null;
            }
          }
        } catch {
          /* avatar là tuỳ chọn */
        }
      }

      setHistory(rows);
    } catch (err: any) {
      // Không im lặng che lỗi: hiển thị để biết cần chạy migration SQL.
      setHistory([]);
      setHistoryError(
        err?.message ? `Không tải được dòng tiền: ${err.message}` : "Không tải được dòng tiền.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Badge / chấm đỏ realtime (không polling).
  const { unread, anyUnread, markSeen } = useCashFlowUnread({
    uid: me?.id ?? null,
    rows: history.map((r) => ({ kind: r.kind, created_at: r.created_at })),
    reload: () => void loadHistory(),
  });

  // Huỷ đơn rút tiền đang chờ duyệt (logic tài chính giữ nguyên ở phía DB).
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelWithdrawal = async (id: string) => {
    setCancellingId(id);
    try {
      const { data, error: e } = await (supabase as any).rpc("request_cancel_withdrawal", {
        p_request_id: id,
      });
      if (e) throw e;
      const res = (Array.isArray(data) ? data[0] : data) as any;
      if (res && res.ok === false) throw new Error(res.message || "Không huỷ được đơn");
      toast.success("Đã huỷ đơn rút tiền — xu đã được hoàn về ví.");
      await loadHistory();
      await refreshMe();
    } catch (err: any) {
      toast.error(err?.message || "Không gửi được yêu cầu huỷ");
    } finally {
      setCancellingId(null);
    }
  };

  const meName = resolveUserName(me as any);
  const meUid = (me as any)?.public_id ?? (me?.id ? deriveUid(me.id) : null);

  // Tải lịch sử ngay khi có user để badge hoạt động ở cả tab "Tạo yêu cầu rút".
  useEffect(() => {
    if (me?.id) void loadHistory();
  }, [me?.id, loadHistory]);


  useEffect(() => {
    if (ready && !me?.id) navigate("/", { replace: true });
  }, [ready, me?.id, navigate]);

  const amount = parseDigits(amountText);
  const fee = useMemo(() => Math.floor((amount * cfg.fee_percent) / 100), [amount, cfg.fee_percent]);
  const net = Math.max(0, amount - fee);
  const animatedNet = useAnimatedNumber(net);
  const animatedFee = useAnimatedNumber(fee);

  const error = useMemo(() => {
    if (!amount) return null;
    if (amount > balance) return "Số xu vượt quá số dư hiện có";
    if (amount < cfg.min_amount) return `Số xu rút tối thiểu là ${formatNumber(cfg.min_amount)} xu`;
    return null;
  }, [amount, balance, cfg.min_amount]);

  const canSubmit = !busy && amount > 0 && !error && !!bank.trim() && !!account.trim() && !!holder.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("create_withdrawal_request", {
        p_amount: amount,
        p_bank_name: bank,
        p_bank_account: account.trim(),
        p_account_holder: holder.trim(),
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`Đã gửi yêu cầu ${row?.code ?? ""} — đang xử lý`);
      await refreshMe();
      setAmountText("");
      setTab("history");

    } catch (e: any) {
      toast.error(e?.message || "Không gửi được yêu cầu rút tiền");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f4f9", color: "#222" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "#fff",
          borderBottom: "1px solid #ececf3",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Về trang chủ"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid #e6e4ee",
            background: "#f6f5fa",
            color: "#222",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Quay lại
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#222" }}>Rút tiền</h1>
      </header>

      <main style={{ maxWidth: 520, margin: "0 auto", padding: "18px 16px 48px" }}>
        <section
          style={{
            borderRadius: 20,
            padding: 20,
            color: "#fff",
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
            boxShadow: "0 18px 40px -22px rgba(139,92,246,0.9)",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.9 }}>Số dư hiện tại</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800 }}>{formatNumber(balance)} xu</div>
            <button type="button" className="wd-transfer" onClick={() => setTransferOpen(true)}>
              Chuyển xu
            </button>
          </div>
        </section>

        <div className="wd-tabs">
          <button
            type="button"
            className={`wd-tab${tab === "create" ? " is-active" : ""}`}
            onClick={() => setTab("create")}
          >
            Tạo yêu cầu rút
          </button>
          <button
            type="button"
            className={`wd-tab${tab === "history" ? " is-active" : ""}`}
            onClick={() => setTab("history")}
          >
            Lịch sử dòng tiền
            {anyUnread ? <span className="cf-badge" aria-label="Có giao dịch mới" /> : null}
          </button>
        </div>

        {tab === "history" ? (
          <>
            {historyError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {historyError}
              </div>
            ) : null}
            <CashFlowHistory
              rows={history}
              loading={loadingHistory}
              onReload={() => void loadHistory()}
              onCancel={(id) => void cancelWithdrawal(id)}
              cancellingId={cancellingId}
              meName={meName}
              meUid={meUid}
              unread={unread}
              markSeen={markSeen}
            />

          </>
        ) : (

        <>


        <label style={label} htmlFor="wd-amount">Nhập số xu muốn rút</label>
        <input
          id="wd-amount"
          inputMode="numeric"
          value={amount ? formatNumber(amount) : ""}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder={`Tối thiểu ${formatNumber(cfg.min_amount)}`}
          style={field}
        />

        <div
          style={{
            marginTop: 14,
            borderRadius: 16,
            padding: 16,
            background: "#fff",
            border: "1px solid #ececf3",
            boxShadow: "0 8px 22px -18px rgba(20,10,40,0.5)",
          }}
        >
          <Row label={`Phí (${cfg.fee_percent}%)`} value={`- ${formatNumber(animatedFee)} xu`} />
          <div style={{ height: 10 }} />
          <Row label="Bạn nhận" value={`${formatNumber(animatedNet)} xu`} strong />
        </div>

        {error ? (
          <p style={{ margin: "10px 2px 0", fontSize: 13, fontWeight: 600, color: "#c02626" }}>
            {error}
          </p>
        ) : null}

        <h2 style={{ margin: "24px 0 0", fontSize: 15, fontWeight: 800, color: "#222" }}>
          Thông tin ngân hàng
        </h2>

        <label style={label} htmlFor="wd-bank">Tên ngân hàng</label>
        <select id="wd-bank" value={bank} onChange={(e) => setBank(e.target.value)} style={field}>
          <option value="">— Chọn ngân hàng —</option>
          {VN_BANKS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <label style={label} htmlFor="wd-acc">Số tài khoản</label>
        <input
          id="wd-acc"
          inputMode="numeric"
          value={account}
          onChange={(e) => setAccount(e.target.value.replace(/[^\d]/g, "").slice(0, 24))}
          placeholder="Nhập số tài khoản"
          style={field}
        />

        <label style={label} htmlFor="wd-holder">Tên chủ tài khoản</label>
        <input
          id="wd-holder"
          value={holder}
          /* Chỉ A-Z và khoảng trắng: tự động in hoa, bỏ dấu tiếng Việt, bỏ ký tự đặc biệt. */
          onChange={(e) => setHolder(normalizeAccountHolder(e.target.value).slice(0, 80))}
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="NGUYEN VAN A"
          style={field}
        />
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginTop: 4 }}>
          Chỉ dùng chữ in hoa A-Z, không dấu, có khoảng trắng. Ví dụ: NGUYEN VAN A
        </div>


        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          style={{
            marginTop: 26,
            width: "100%",
            padding: "16px 18px",
            borderRadius: 16,
            border: "none",
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.55,
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: 0.4,
            color: "#fff",
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
            boxShadow: "0 16px 34px -18px rgba(236,72,153,0.9)",
          }}
        >
          {busy ? "ĐANG GỬI…" : "RÚT TIỀN"}
        </button>
        </>
        )}
      </main>


      <style>{`
        #wd-amount::placeholder, #wd-acc::placeholder, #wd-holder::placeholder { color: #777; font-weight: 500; }
        .wd-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px;
          background: #efedf6; padding: 6px; border-radius: 16px; }
        .wd-tab { border: none; background: transparent; border-radius: 12px; padding: 11px 10px;
          font-size: 14px; font-weight: 800; color: #6b6880; cursor: pointer; transition: .18s; }
        .wd-tab.is-active { background: #fff; color: #7c3aed; box-shadow: 0 8px 20px -14px rgba(20,10,40,.6); }
        .wd-transfer { border: 1px solid rgba(255,255,255,.55); background: rgba(255,255,255,.18);
          color: #fff; border-radius: 999px; padding: 9px 16px; font-size: 14px; font-weight: 800;
          cursor: pointer; backdrop-filter: blur(6px); transition: .18s; }
        .wd-transfer:hover { background: rgba(255,255,255,.3); transform: translateY(-1px); }
        .wd-reload { border: 1px solid #e6e4ee; background: #fff; border-radius: 12px; padding: 8px 14px;
          font-weight: 700; font-size: 13px; color: #444; cursor: pointer; margin-top: 10px; }

      `}</style>

      {transferOpen ? (
        <Suspense fallback={null}>
          <TransferGemModal onClose={() => setTransferOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

function Row({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>{l}</span>
      <span
        style={{
          fontSize: strong ? 20 : 15,
          fontWeight: 800,
          color: strong ? "#7c3aed" : "#222",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function WithdrawPage() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
