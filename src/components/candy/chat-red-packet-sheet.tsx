import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { sendChatRedPacket } from "@/lib/chat-red-packet";

const WISH_CHIPS = [
  "🧧 Chúc mừng",
  "❤️ Chúc em ngủ ngon",
  "🎂 Happy Birthday",
  "🍀 Lì xì đầu tháng",
  "💖 Chúc em luôn vui vẻ",
  "🌸 Chúc một ngày tốt lành",
  "🥰 Gửi chút yêu thương",
  "💰 Chúc phát tài phát lộc",
];

function formatVN(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("vi-VN");
}
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface Props {
  receiverId: string;
  balance: number;
  onClose: () => void;
  onSent: (info: { packetId: string; amount: number; wish: string | null; newBalance: number }) => void;
}

export function ChatRedPacketSheet({ receiverId, balance, onClose, onSent }: Props) {
  const [amountRaw, setAmountRaw] = useState("");
  const [wish, setWish] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validate = (): string | null => {
    if (!amount || amount <= 0) return "Vui lòng nhập số Xu";
    if (amount < 1000) return "Số Xu tối thiểu là 1.000";
    if (amount > balance) return "Số dư không đủ";
    if (wish.length > 100) return "Lời chúc tối đa 100 ký tự";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSending(true);
    try {
      const res = await sendChatRedPacket(receiverId, amount, wish.trim() || null);
      if (!res?.ok) {
        setError(res?.message || "Không gửi được bao lì xì");
        return;
      }
      onSent({
        packetId: res.packet_id!,
        amount: res.amount ?? amount,
        wish: res.wish ?? null,
        newBalance: res.new_balance ?? balance - amount,
      });
    } catch (e: any) {
      setError(e?.message || "Có lỗi xảy ra");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="hongbao-sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="hongbao-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="hongbao-sheet-handle" aria-hidden />
        <div className="hongbao-sheet-header">
          <div className="hongbao-sheet-title">Gửi Bao Lì Xì</div>
          <button className="hongbao-sheet-close" onClick={onClose} aria-label="Đóng">
            <X size={14} />
          </button>
        </div>

        <div className="hongbao-sheet-body">
          <div className="hongbao-balance">
            <span>Số dư</span>
            <span className="hongbao-balance-value">{formatVN(balance) || "0"}</span>
          </div>

          <div className="hongbao-field-label">Số Xu muốn tặng</div>
          <input
            ref={inputRef}
            className={`hongbao-amount-input${error && (amount < 1000 || amount > balance) ? " is-error" : ""}`}
            inputMode="numeric"
            placeholder="0"
            value={amountRaw ? formatVN(amount) : ""}
            onChange={(e) => { setError(null); setAmountRaw(e.target.value); }}
          />


          <div className="hongbao-field-label">Lời chúc</div>
          <div className="hongbao-wish-chips">
            {WISH_CHIPS.map((w) => (
              <button
                key={w}
                type="button"
                className={`hongbao-wish-chip${wish === w ? " is-active" : ""}`}
                onClick={() => setWish(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <input
            className="hongbao-wish-input"
            maxLength={100}
            placeholder="Tự nhập lời chúc…"
            value={wish}
            onChange={(e) => setWish(e.target.value)}
          />

          {error ? <div className="hongbao-error">{error}</div> : null}
        </div>

        <div className="hongbao-sheet-footer">
          <button
            type="button"
            className="hongbao-submit"
            disabled={sending || !amount}
            onClick={handleSubmit}
          >
            {sending ? "Đang gửi..." : "Gửi Bao Lì Xì"}
          </button>
        </div>
      </div>
    </div>
  );
}
