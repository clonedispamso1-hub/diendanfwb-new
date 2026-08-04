import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { useNotification } from "@/components/candy/notification-provider";
import { Portal } from "@/components/candy/portal";
import { formatCandy } from "@/lib/format";
import { safeGemAmount } from "@/lib/gem-utils";

interface TransferCandyDialogProps {
  receiverId: string;
  receiverName: string;
  onClose: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Bạn không đủ Gem để chuyển.",
  CANNOT_SELF_TRANSFER: "Không thể chuyển Gem cho chính mình.",
  INVALID_RECIPIENT: "Người nhận không hợp lệ.",
  INVALID_AMOUNT: "Số Gem không hợp lệ.",
  RECEIVER_NOT_FOUND: "Không tìm thấy người nhận.",
  NOT_AUTHENTICATED: "Bạn cần đăng nhập để chuyển Gem.",
  INVALID_RECEIVER: "Người nhận không hợp lệ.",
  SENDER_PROFILE_MISSING: "Hồ sơ của bạn không tồn tại.",
};

function readableError(message: string) {
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (message.includes(key)) return ERROR_MESSAGES[key];
  }
  return message;
}

export function TransferCandyDialog({ receiverId, receiverName, onClose }: TransferCandyDialogProps) {
  const { me, refreshMe, setGemBalance } = useAuth();
  const { notify } = useNotification();
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = me?.gem_balance || 0;
  const isSelfTarget = !!me?.id && me.id === receiverId;


  // ESC để đóng + lock scroll body khi modal mở
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, sending]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSelfTarget) {
      setError("Bạn không thể tự chuyển ⭐ cho chính mình.");
      return;
    }
    const value = Number.parseInt(amount, 10);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Vui lòng nhập số Coin hợp lệ.");
      return;
    }

    if (value > balance) {
      setError("Bạn không đủ Coin.");
      return;
    }

    setSending(true);
    // RPC bảo mật tổng lực — không update profiles.gem_balance trực tiếp từ client
    const { data: rpcData, error: rpcError } = await supabase.rpc("secure_transfer_gem" as any, {
      p_receiver_id: receiverId,
      p_amount: Number(safeGemAmount(value)),
      p_note: null,
    });

    if (rpcError) {
      console.error("LỖI HỆ THỐNG RPC CHI TIẾT:", rpcError);
      setError(`Lỗi hệ thống: ${rpcError.message || (rpcError as any).details || "Không xác định"}`);
      setSending(false);
      return;
    }
    const res: any = rpcData;
    if (!res || res.ok === false) {
      const msg = res?.message || "";
      if (msg.includes("COOLDOWN")) {
        const m = msg.match(/COOLDOWN:\s*(\d+)/);
        setError(`Vui lòng đợi ${m?.[1] ?? "vài"} giây trước khi chuyển tiếp.`);
      } else {
        setError(msg ? readableError(msg) : "Giao dịch thất bại!");
      }
      setSending(false);
      return;
    }

    const safeAmount = safeGemAmount(value);
    const newBalance = Number(res?.new_balance ?? res?.sender_new_balance);
    if (Number.isFinite(newBalance)) setGemBalance(newBalance);
    else setGemBalance(Math.max(0, Number(balance) - Number(safeAmount)));

    // Popup pink toast đã bị gỡ bỏ theo yêu cầu.

    void refreshMe();
    setSending(false);
    onClose();
  };

  return (
    <Portal>
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10010 }}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button
          type="button"
          className="popup-close-x"
          onClick={onClose}
          aria-label="Đóng"
        >
          <X size={20} />
        </button>
        <div
          className="modal-header"
          style={{ padding: "16px 20px 8px", paddingRight: 56 }}
        >
          <h3 className="section-title" style={{ margin: 0 }}>💎 Chuyển Gem</h3>
        </div>
        <form className="modal-body stack-md" onSubmit={submit} style={{ padding: "8px 20px 20px" }}>
          <p className="muted-copy">
            Người nhận: <strong>{receiverName}</strong>
          </p>
          <p className="muted-copy">Số dư hiện tại: 💎 {formatCandy(balance)} Gem</p>
          {isSelfTarget ? (
            <p className="text-sm" style={{ color: "hsl(0 70% 45%)", margin: 0 }}>
              Bạn không thể tự chuyển ⭐ cho chính mình.
            </p>
          ) : null}


          <label className="field-label">
            <span>Số Gem muốn chuyển</span>
            <input
              className="app-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onChange={(e) => {
                // Chỉ giữ chữ số, loại bỏ dấu/chữ → tránh NaN, âm
                const cleaned = e.target.value.replace(/[^\d]/g, "");
                setAmount(cleaned);
              }}
              placeholder="VD: 100"
              autoFocus
              maxLength={12}
            />
          </label>

          {error ? (
            <p className="text-sm" style={{ color: "hsl(0 70% 45%)" }}>{error}</p>
          ) : null}

          <div className="inline-flex gap-3 justify-end">
            <button type="button" className="secondary-cta compact" onClick={onClose} disabled={sending}>
              Hủy
            </button>
            <button type="submit" className="primary-cta compact" disabled={sending || !amount || isSelfTarget}>
              <Send size={14} /> {sending ? "Đang chuyển..." : "Xác nhận"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}
