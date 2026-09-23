/**
 * DepositNoQrModal — popup Admin "Tạo lệnh nạp không mã QR".
 * Form nhập thông tin, style LIGHT premium. Chỉ admin mới mở được (gate ở chat-page).
 */
import { useEffect, useState } from "react";
import { X, Clock } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import type { VipPaymentPayload } from "@/lib/vip-payment";

interface DepositNoQrModalProps {
  open: boolean;
  onClose: () => void;
  /** Admin bấm Tạo lệnh → tạo Card thanh toán trong chat. */
  onSubmit?: (payload: VipPaymentPayload) => void;
}

export function DepositNoQrModal({ open, onClose, onSubmit }: DepositNoQrModalProps) {
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [transferContent, setTransferContent] = useState("");
  const [amount, setAmount] = useState("");
  const [minutes, setMinutes] = useState("15");
  const [seconds, setSeconds] = useState("00");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSend = () => {
    const durationSec =
      (Number(minutes.replace(/\D/g, "")) || 0) * 60 + (Number(seconds.replace(/\D/g, "")) || 0);
    onSubmit?.({
      bank: bankName.trim(),
      account: accountNumber.trim(),
      holder: accountHolder.trim(),
      zone: "",
      note: transferContent.trim(),
      amount: amount.replace(/\D/g, ""),
      durationSec,
      expiresAt: Date.now() + durationSec * 1000,
      qrUrl: null,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <Portal>
      <div
        className="dm-overlay"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="dm-card" role="dialog" aria-modal="true" aria-labelledby="dm-noqr-title">
          <div className="dm-handle" aria-hidden="true" />

          <button type="button" className="dm-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>

          <div className="dm-head">
            <h2 id="dm-noqr-title" className="dm-title">
              Tạo lệnh nạp không QR
            </h2>
            <p className="dm-sub">Nhập thông tin chuyển khoản để tạo lệnh</p>
          </div>

          <div className="dm-body">
            <label className="dm-field">
              <span className="dm-label">Tên ngân hàng</span>
              <input
                type="text"
                className="dm-input"
                placeholder="VD: MB Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </label>

            <div className="dm-row">
              <label className="dm-field">
                <span className="dm-label">Số tài khoản</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="dm-input"
                  placeholder="0123456789"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </label>

              <label className="dm-field">
                <span className="dm-label">Chủ tài khoản</span>
                <input
                  type="text"
                  className="dm-input"
                  placeholder="NGUYEN VAN A"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                />
              </label>
            </div>

            <label className="dm-field">
              <span className="dm-label">Nội dung chuyển khoản</span>
              <input
                type="text"
                className="dm-input"
                placeholder="VD: NAP 500K"
                value={transferContent}
                onChange={(e) => setTransferContent(e.target.value)}
              />
            </label>

            <label className="dm-field">
              <span className="dm-label">Số tiền</span>
              <input
                type="text"
                inputMode="numeric"
                className="dm-input"
                placeholder="VD: 500000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            <div className="dm-field">
              <span className="dm-label">
                <Clock size={13} /> Thời gian hiệu lực
              </span>
              <div className="dm-time-grid">
                <label className="dm-time-item">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    className="dm-input dm-input--mmss"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  />
                  <span className="dm-time-label">Phút</span>
                </label>
                <label className="dm-time-item">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    className="dm-input dm-input--mmss"
                    value={seconds}
                    onChange={(e) =>
                      setSeconds(
                        String(
                          Math.min(59, Number(e.target.value.replace(/\D/g, "")) || 0)
                        ).slice(0, 2)
                      )
                    }
                  />
                  <span className="dm-time-label">Giây</span>
                </label>
              </div>
            </div>
          </div>

          <div className="dm-actions">
            <button type="button" className="dm-btn dm-btn--ghost" onClick={onClose}>
              Hủy
            </button>
            <button type="button" className="dm-btn dm-btn--primary" onClick={handleSend}>
              Tạo lệnh
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
