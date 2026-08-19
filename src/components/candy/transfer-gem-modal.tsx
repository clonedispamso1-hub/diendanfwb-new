import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { useNotification } from "@/components/candy/notification-provider";
import { Portal } from "@/components/candy/portal";
import { formatNumber, parseDigits } from "@/lib/format";
import { safeGemAmount } from "@/lib/gem-utils";

interface TransferGemModalProps { onClose: () => void }

interface FoundProfile {
  id: string;
  full_name: string | null;
  public_id: string | null;
  avatar: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Không đủ Coin để chuyển.",
  CANNOT_SELF_TRANSFER: "Không thể chuyển cho chính mình.",
  INVALID_RECIPIENT: "Người nhận không hợp lệ.",
  INVALID_AMOUNT: "Số Coin không hợp lệ.",
  RECEIVER_NOT_FOUND: "Không tìm thấy người nhận.",
  NOT_AUTHENTICATED: "Bạn cần đăng nhập.",
};
function readable(msg: string) {
  for (const k of Object.keys(ERROR_MESSAGES)) if (msg.includes(k)) return ERROR_MESSAGES[k];
  return "Giao dịch không thể thực hiện. Vui lòng thử lại.";
}

/**
 * TransferGemModal — iOS-style minimal design.
 * Không icon, không sao trang trí. Chỉ: Số dư, UID, Số Coin, Lời nhắn, Huỷ, Chuyển.
 */
export function TransferGemModal({ onClose }: TransferGemModalProps) {
  const { me, refreshMe, setGemBalance } = useAuth();
  const { notify } = useNotification();
  const balance = me?.gem_balance || 0;

  const [uidInput, setUidInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [success, setSuccess] = useState(false);

  const amountValue = useMemo(() => parseDigits(amount), [amount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, sending]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = uidInput.trim();
    setError(null);
    if (!q || q.length < 3) {
      setFound(null); setNotFound(false); setIsSelf(false); setIsLocked(false); setSearching(false); return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      // Chỉ lấy dữ liệu tối thiểu để hiển thị (không username/email/phone/role).
      const cols = "id, full_name, public_id, avatar, is_banned, account_status, status";
      let prof: any = null;
      {
        const { data } = await supabase.from("profiles").select(cols).ilike("public_id", q).maybeSingle();
        if (data) prof = data;
      }
      if (!prof && /^[0-9a-f-]{20,}$/i.test(q)) {
        const { data } = await supabase.from("profiles").select(cols).eq("id", q).maybeSingle();
        if (data) prof = data;
      }
      const self = !!(prof && prof.id === me?.id);
      if (self) prof = null;
      const st = prof ? (prof.account_status ?? prof.status ?? null) : null;
      const locked = !!prof && (prof.is_banned === true || st === "banned" || st === "suspended" || st === "locked");
      if (locked) prof = null;
      setIsSelf(self);
      setIsLocked(locked);
      setFound(prof ? { id: prof.id, full_name: prof.full_name, public_id: prof.public_id, avatar: prof.avatar } : null);
      setNotFound(!prof && !self && !locked);
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [uidInput, me?.id]);

  const onAmountChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setAmount(digits ? formatNumber(digits) : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    if (!found) { setError("Hãy nhập UID người nhận hợp lệ."); return; }
    if (cooldownLeft > 0) { setError(`Đợi ${cooldownLeft}s.`); return; }
    if (!Number.isFinite(amountValue) || amountValue <= 0) { setError("Số Coin không hợp lệ."); return; }
    if (amountValue > balance) { setError("Vượt quá số dư."); return; }

    setSending(true);
    const safeAmount = safeGemAmount(amountValue);
    const { data, error: rpcError } = await supabase.rpc("secure_transfer_gem" as any, {
      p_receiver_id: found.id,
      p_amount: Number(safeAmount),
      p_note: note || null,
    });
    if (rpcError) {
      setError(readable(rpcError.message || ""));
      setSending(false);
      return;
    }
    const res: any = data;
    if (!res || res.ok === false) {
      const msg = res?.message || "";
      const m = msg.match(/COOLDOWN:\s*(\d+)/);
      if (m) { const s = Number(m[1]); setCooldownLeft(s); setError(`Đợi ${s}s rồi thử lại.`); }
      else setError(msg ? readable(msg) : "Giao dịch thất bại!");
      setSending(false);
      return;
    }
    const newBalance = Number(res?.new_balance ?? res?.sender_new_balance);
    if (Number.isFinite(newBalance)) setGemBalance(newBalance);
    else setGemBalance(Math.max(0, Number(balance) - Number(safeAmount)));
    setSuccess(true);
    // Popup pink toast đã bị gỡ bỏ theo yêu cầu.

    void refreshMe();
    setCooldownLeft(30);
    window.setTimeout(() => { setSending(false); onClose(); }, 1200);
  };

  return (
    <Portal>
      <style>{`
        @keyframes ios-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ios-pop  { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
        .ios-tx-backdrop {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.42);
          backdrop-filter: blur(14px) saturate(180%);
          -webkit-backdrop-filter: blur(14px) saturate(180%);
          animation: ios-fade 0.2s ease-out;
          padding: 16px;
        }
        .ios-tx-panel {
          width: 100%; max-width: 360px;
          background: rgba(255,255,255,0.98);
          color: #111;
          border-radius: 22px;
          padding: 22px 20px 18px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.35);
          animation: ios-pop 0.28s cubic-bezier(0.22,1,0.36,1);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        @media (prefers-color-scheme: dark) {
          .ios-tx-panel { background: rgba(28,28,30,0.98); color: #f5f5f7; }
          .ios-tx-row  { background: rgba(120,120,128,0.16); }
          .ios-tx-row + .ios-tx-row { border-top-color: rgba(120,120,128,0.28); }
          .ios-tx-label { color: rgba(235,235,245,0.6); }
          .ios-tx-help  { color: rgba(235,235,245,0.5); }
          .ios-tx-cancel { background: rgba(120,120,128,0.24); color: #f5f5f7; }
        }
        .ios-tx-title { font-size: 17px; font-weight: 600; text-align: center; letter-spacing: -0.01em; }
        .ios-tx-sub   { font-size: 13px; color: #8e8e93; text-align: center; margin-top: 2px; }
        .ios-tx-balance-card {
          margin-top: 16px; padding: 14px 16px;
          background: rgba(120,120,128,0.12);
          border-radius: 14px;
          display: flex; justify-content: space-between; align-items: baseline;
        }
        .ios-tx-balance-label { font-size: 13px; color: #8e8e93; }
        .ios-tx-balance-value { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .ios-tx-group { margin-top: 14px; border-radius: 14px; overflow: hidden; background: rgba(120,120,128,0.12); }
        .ios-tx-row { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
        .ios-tx-row + .ios-tx-row { border-top: 1px solid rgba(60,60,67,0.12); }
        .ios-tx-label { font-size: 12px; color: #8e8e93; font-weight: 500; letter-spacing: -0.01em; }
        .ios-tx-input {
          background: transparent; border: 0; outline: 0;
          font-size: 16px; color: inherit; width: 100%;
          font-family: inherit; letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
        }
        .ios-tx-input::placeholder { color: rgba(60,60,67,0.35); }
        .ios-tx-recipient { font-size: 15px; font-weight: 500; margin-top: 2px; }
        .ios-tx-card {
          margin-top: 10px; padding: 12px 14px;
          display: flex; align-items: center; gap: 12px;
          background: rgba(52,199,89,0.10);
          border: 1px solid rgba(52,199,89,0.35);
          border-radius: 14px;
          animation: ios-pop 0.22s cubic-bezier(0.22,1,0.36,1);
        }
        .ios-tx-card__avatar {
          width: 44px; height: 44px; border-radius: 50%;
          object-fit: cover; background: rgba(120,120,128,0.2);
          display: grid; place-items: center; font-size: 20px; flex: 0 0 44px;
        }
        .ios-tx-card__name { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
        .ios-tx-card__tag { font-size: 12px; color: #34c759; font-weight: 600; display: flex; align-items: center; gap: 4px; }
        .ios-tx-searching { font-size: 13px; color: #8e8e93; margin-top: 6px; }
        .ios-tx-help { font-size: 12px; color: #8e8e93; margin-top: 6px; text-align: center; }
        .ios-tx-error { font-size: 13px; color: #ff3b30; margin-top: 10px; text-align: center; }
        .ios-tx-actions { display: flex; gap: 10px; margin-top: 18px; }
        .ios-tx-btn {
          flex: 1; height: 46px; border-radius: 14px; border: 0;
          font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
          cursor: pointer; transition: opacity 0.15s, transform 0.1s;
          font-family: inherit;
        }
        .ios-tx-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ios-tx-btn:not(:disabled):active { transform: scale(0.97); }
        .ios-tx-cancel { background: rgba(120,120,128,0.16); color: #111; }
        .ios-tx-primary { background: #007aff; color: #fff; }
        .ios-tx-success {
          padding: 30px 8px; text-align: center;
        }
        .ios-tx-success-mark {
          width: 56px; height: 56px; border-radius: 50%;
          margin: 0 auto 14px;
          background: #34c759; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 30px; font-weight: 700;
        }
      `}</style>

      <div className="ios-tx-backdrop" onClick={() => !sending && onClose()}>
        <div className="ios-tx-panel" onClick={(e) => e.stopPropagation()}>
          {success ? (
            <div className="ios-tx-success">
              <div className="ios-tx-mark ios-tx-success-mark">✓</div>
              <div className="ios-tx-title">Đã chuyển thành công</div>
              <div className="ios-tx-sub">
                {formatNumber(amountValue)} Coin → {found?.full_name || found?.public_id}
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="ios-tx-title">Chuyển Coin</div>

              <div className="ios-tx-balance-card">
                <span className="ios-tx-balance-label">Số dư</span>
                <span className="ios-tx-balance-value">{formatNumber(balance)}</span>
              </div>

              <div className="ios-tx-group">
                <div className="ios-tx-row">
                  <span className="ios-tx-label">UID người nhận</span>
                  <input
                    className="ios-tx-input"
                    type="text"
                    value={uidInput}
                    onChange={(e) => setUidInput(e.target.value)}
                    placeholder="Nhập UID"
                    autoFocus
                    maxLength={64}
                    disabled={sending}
                  />
                  {searching ? (
                    <div className="ios-tx-searching">Đang tìm người nhận…</div>
                  ) : isSelf ? (
                    <div className="ios-tx-recipient" style={{ color: "#ff3b30" }}>Không thể tự chuyển cho mình.</div>
                  ) : isLocked ? (
                    <div className="ios-tx-recipient" style={{ color: "#ff3b30" }}>Tài khoản hiện không thể nhận xu.</div>
                  ) : notFound ? (
                    <div className="ios-tx-recipient" style={{ color: "#ff3b30" }}>Không tìm thấy người nhận.</div>
                  ) : null}
                </div>
              </div>

              {found ? (
                <div className="ios-tx-card">
                  {found.avatar ? (
                    <img loading="lazy" decoding="async" className="ios-tx-card__avatar" src={found.avatar} alt="" />
                  ) : (
                    <div className="ios-tx-card__avatar">👤</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="ios-tx-card__tag">✔ Người nhận</div>
                    <div className="ios-tx-card__name">{found.full_name || "Người dùng"}</div>
                  </div>
                </div>
              ) : null}

              {found ? (
              <div className="ios-tx-group">
                <div className="ios-tx-row">
                  <span className="ios-tx-label">Số Coin muốn chuyển</span>
                  <input
                    className="ios-tx-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => onAmountChange(e.target.value)}
                    placeholder="0"
                    maxLength={15}
                    disabled={sending}
                  />
                </div>

                <div className="ios-tx-row">
                  <span className="ios-tx-label">Lời nhắn</span>
                  <input
                    className="ios-tx-input"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Không bắt buộc"
                    maxLength={140}
                    disabled={sending}
                  />
                </div>
              </div>
              ) : null}

              {error ? <div className="ios-tx-error">{error}</div> : null}
              {cooldownLeft > 0 && !error ? (
                <div className="ios-tx-help">Đợi {cooldownLeft}s rồi thử lại.</div>
              ) : null}

              <div className="ios-tx-actions">
                <button
                  type="button"
                  className="ios-tx-btn ios-tx-cancel"
                  onClick={onClose}
                  disabled={sending}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="ios-tx-btn ios-tx-primary"
                  disabled={sending || !found || amountValue <= 0 || cooldownLeft > 0}
                >
                  {sending ? "Đang chuyển…" : "Chuyển"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Portal>
  );
}
