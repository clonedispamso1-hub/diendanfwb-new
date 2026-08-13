/**
 * V6 — Trang Rút tiền (/wallet/withdraw). Phong cách Banking App: nền sáng,
 * chữ đậm dễ đọc, bo góc 16px, shadow nhẹ, tính phí + animate số realtime.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, parseDigits } from "@/lib/format";
import { useWithdrawConfig, VN_BANKS } from "@/lib/withdraw";

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

export type WdRow = {
  id: string;
  code: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: "pending" | "approved" | "rejected" | "refunded";
  created_at: string;
};

const WD_STATUS: Record<WdRow["status"], { label: string; color: string }> = {
  pending: { label: "⏳ Chờ duyệt", color: "#b45309" },
  approved: { label: "✅ Thành công", color: "#047857" },
  rejected: { label: "❌ Từ chối", color: "#b91c1c" },
  refunded: { label: "🔄 Đã hoàn tiền", color: "#4f46e5" },
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

function WithdrawHistory({
  rows,
  loading,
  onReload,
}: {
  rows: WdRow[];
  loading: boolean;
  onReload: () => void;
}) {
  if (loading) {
    return <p style={{ padding: 24, textAlign: "center", color: "#666", fontWeight: 600 }}>Đang tải…</p>;
  }
  if (!rows.length) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: "#666", fontWeight: 600 }}>
        Chưa có yêu cầu rút tiền nào.
        <div>
          <button type="button" onClick={onReload} className="wd-reload">Tải lại</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" onClick={onReload} className="wd-reload">Tải lại</button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {rows.map((r) => {
          const st = WD_STATUS[r.status] ?? WD_STATUS.pending;
          return (
            <li
              key={r.id}
              style={{
                background: "#fff",
                border: "1px solid #ececf3",
                borderRadius: 16,
                padding: 14,
                boxShadow: "0 8px 22px -18px rgba(20,10,40,0.5)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#222" }}>{r.code}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: st.color }}>{st.label}</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Cell label="Số xu" value={formatNumber(r.amount)} />
                <Cell label="Phí" value={formatNumber(r.fee)} />
                <Cell label="Thực nhận" value={formatNumber(r.net_amount)} strong />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#777", fontWeight: 600 }}>
                {formatWhen(r.created_at)}
              </div>
            </li>
          );
        })}
      </ul>
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
  const [history, setHistory] = useState<WdRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error: e } = await (supabase as any).rpc("my_withdrawal_requests");
      if (e) throw e;
      setHistory((data as WdRow[]) ?? []);
    } catch {
      const { data } = await (supabase as any)
        .from("withdrawal_requests")
        .select("id, code, amount, fee, net_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setHistory((data as WdRow[]) ?? []);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (tab === "history") void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);


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
          onClick={() => navigate(-1)}
          aria-label="Quay lại"
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
          <ArrowLeft size={18} /> Quay lại
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
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {formatNumber(balance)} xu
          </div>
        </section>

        <div className="wd-tabs">
          <button
            type="button"
            className={`wd-tab${tab === "create" ? " is-active" : ""}`}
            onClick={() => setTab("create")}
          >
            💸 Tạo yêu cầu rút
          </button>
          <button
            type="button"
            className={`wd-tab${tab === "history" ? " is-active" : ""}`}
            onClick={() => setTab("history")}
          >
            📋 Lịch sử rút tiền
          </button>
        </div>

        {tab === "history" ? (
          <WithdrawHistory rows={history} loading={loadingHistory} onReload={() => void loadHistory()} />
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
            ⚠️ {error}
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
          onChange={(e) => setHolder(e.target.value.slice(0, 80))}
          placeholder="NGUYEN VAN A"
          style={field}
        />

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
        .wd-reload { border: 1px solid #e6e4ee; background: #fff; border-radius: 12px; padding: 8px 14px;
          font-weight: 700; font-size: 13px; color: #444; cursor: pointer; margin-top: 10px; }

      `}</style>
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
