/**
 * CoinTransferChatModal — giao diện "Chuyển Xu" mở từ menu của khung chat.
 * Người nhận được điền sẵn theo đúng người đang trò chuyện (UID + avatar + tên).
 * Sau khi RPC `secure_transfer_gem` thành công, trả payload hoá đơn ra ngoài
 * để chat-page gửi thẻ giao dịch vào cuộc trò chuyện.
 */
import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { formatCandy, digitsOnly, formatThousands } from "@/lib/format";
import { safeGemAmount } from "@/lib/gem-utils";
import { resolveUserName } from "@/lib/user-name";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { generateTransactionCode, type CoinBillPayload } from "@/lib/coin-transfer-bill";

interface CoinTransferChatModalProps {
  open: boolean;
  onClose: () => void;
  /** Hồ sơ người đang chat — nguồn UID / tên / avatar người nhận. */
  receiver: any;
  receiverId: string;
  onSuccess: (payload: CoinBillPayload) => void;
}

export function CoinTransferChatModal({
  open, onClose, receiver, receiverId, onSuccess,
}: CoinTransferChatModalProps) {
  const { me, refreshMe, setGemBalance } = useAuth();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  const balance = Number((me as any)?.gem_balance || 0);
  const receiverName = resolveUserName(receiver, "Người dùng");
  const receiverUid = String((receiver as any)?.public_id || receiverId || "");
  const isSelf = !!me?.id && me.id === receiverId;

  useEffect(() => {
    if (!open) { setAmount(""); setNote(""); setError(null); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, sending]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!me?.id) { setError("Bạn cần đăng nhập."); return; }
    if (isSelf) { setError("Bạn không thể tự chuyển Xu cho chính mình."); return; }

    const value = safeGemAmount(amount);
    if (value <= 0) { setError("Vui lòng nhập số Xu hợp lệ."); return; }
    if (value > balance) { setError("Bạn không đủ Xu."); return; }

    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
    const trimmedNote = note.trim();
    const { data, error: rpcError } = await supabase.rpc("secure_transfer_gem" as any, {
      p_receiver_id: receiverId,
      p_amount: value,
      p_note: trimmedNote || null,
    });

    if (rpcError) {
      setError(`Lỗi hệ thống: ${rpcError.message || "Không xác định"}`);
      setSending(false);
      return;
    }
    const res: any = data;
    if (!res || res.ok === false) {
      const msg: string = res?.message || "";
      if (msg.includes("COOLDOWN")) {
        const m = msg.match(/COOLDOWN:\s*(\d+)/);
        setError(`Vui lòng đợi ${m?.[1] ?? "vài"} giây trước khi chuyển tiếp.`);
      } else {
        setError(msg || "Giao dịch thất bại!");
      }
      setSending(false);
      return;
    }

    const newBalance = Number(res?.new_balance ?? res?.sender_new_balance);
    if (Number.isFinite(newBalance)) setGemBalance(newBalance);
    else setGemBalance(Math.max(0, balance - value));
    void refreshMe();

    const txId = res?.tx_id ?? res?.transaction_id ?? null;
    onSuccess({
      code: txId ? `TX-${String(txId).slice(0, 8).toUpperCase()}` : generateTransactionCode(),
      txId: txId ? String(txId) : null,
      senderId: me.id,
      senderName: resolveUserName(me as any, "Bạn"),
      senderAvatar: (me as any)?.avatar || (me as any)?.avatar_url || null,
      receiverId,
      receiverName,
      receiverAvatar: (receiver as any)?.avatar || (receiver as any)?.avatar_url || null,
      amount: value,
      note: trimmedNote || null,
      at: Date.now(),
      status: "success",
    });

    setSending(false);
    onClose();
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <Portal>
      <div className="modal-backdrop" onClick={() => { if (!sending) onClose(); }} style={{ zIndex: 10010 }}>
        <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
          <button type="button" className="popup-close-x" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
          <div className="modal-header" style={{ padding: "16px 20px 8px", paddingRight: 56 }}>
            <h3 className="section-title" style={{ margin: 0 }}>🪙 Chuyển Xu</h3>
          </div>
          <form className="modal-body stack-md" onSubmit={submit} style={{ padding: "8px 20px 20px", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src={getValidAvatarUrl((receiver as any)?.avatar || (receiver as any)?.avatar_url)}
                onError={handleAvatarError}
                alt={receiverName}
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{receiverName}</div>
                <div style={{ fontSize: 12, opacity: 0.65, wordBreak: "break-all" }}>UID: {receiverUid}</div>
              </div>
            </div>

            <p className="muted-copy" style={{ margin: 0 }}>Số dư hiện tại: 🪙 {formatCandy(balance)} Xu</p>

            <label className="field-label">
              <span>Nội dung chuyển xu</span>
              <input
                className="app-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Quà tặng bạn"
                maxLength={120}
              />
            </label>

            <label className="field-label">
              <span>Số Xu</span>
              <input
                className="app-input"
                type="text"
                inputMode="numeric"
                value={formatThousands(amount)}
                onChange={(e) => setAmount(digitsOnly(e.target.value))}
                placeholder="VD: 10,000"
                maxLength={16}
                autoFocus
              />
            </label>

            {error ? <p className="text-sm" style={{ color: "hsl(0 70% 45%)", margin: 0 }}>{error}</p> : null}

            <div className="inline-flex gap-3 justify-end">
              <button type="button" className="secondary-cta compact" onClick={onClose} disabled={sending}>Hủy</button>
              <button type="submit" className="primary-cta compact" disabled={sending || !amount || isSelf}>
                <Send size={14} /> {sending ? "Đang chuyển..." : "Chuyển Xu"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
