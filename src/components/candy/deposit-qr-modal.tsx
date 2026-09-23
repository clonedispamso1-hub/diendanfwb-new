/**
 * DepositQrModal — popup Admin "Tạo lệnh nạp có mã QR".
 * Ảnh QR upload ở trên cùng, form nhập bên dưới. Style LIGHT premium.
 */
import { useEffect, useRef, useState } from "react";
import { X, Upload, Clock, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Portal } from "@/components/candy/portal";
import type { VipPaymentPayload } from "@/lib/vip-payment";

interface DepositQrModalProps {
  open: boolean;
  onClose: () => void;
  /** Admin bấm Tạo lệnh → tạo Card thanh toán trong chat. */
  onSubmit?: (payload: VipPaymentPayload) => void;
}

export function DepositQrModal({ open, onClose, onSubmit }: DepositQrModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [transferContent, setTransferContent] = useState("");
  const [amount, setAmount] = useState("");
  const [minutes, setMinutes] = useState("15");
  const [seconds, setSeconds] = useState("00");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  /** Tạo lệnh → upload ảnh QR (nếu có) rồi tạo Card thanh toán trong chat. */
  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    let qrUrl: string | null = null;
    if (file) {
      try {
        // QR là dữ liệu thanh toán → lưu vào Supabase Storage, KHÔNG nén.
        const { uploadPaymentQrUrl } = await import("@/lib/media");
        qrUrl = await uploadPaymentQrUrl(file);
      } catch (err) {
        console.error("[deposit-qr] upload QR thất bại", err);
        toast.error(
          "Không tải được ảnh QR: " +
            ((err as Error)?.message || "lỗi không xác định") +
            ". Lệnh chưa được tạo.",
        );
        setSending(false);
        return; // KHÔNG tạo lệnh QR mà thiếu ảnh QR.
      }
      if (!qrUrl) {
        toast.error("Không lấy được đường dẫn ảnh QR. Lệnh chưa được tạo.");
        setSending(false);
        return;
      }
    }
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
      qrUrl,
    });
    setSending(false);
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
        <div className="dm-card" role="dialog" aria-modal="true" aria-labelledby="dm-qr-title">
          <div className="dm-handle" aria-hidden="true" />

          <button type="button" className="dm-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>

          <div className="dm-head">
            <h2 id="dm-qr-title" className="dm-title">
              Tạo lệnh nạp có QR
            </h2>
            <p className="dm-sub">Tải ảnh QR và nhập thông tin chuyển khoản</p>
          </div>

          <div className="dm-body">
            <button
              type="button"
              className="dm-upload"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="dm-upload-input"
                onChange={(e) => handleFileChange(e.target.files)}
              />
              {previewUrl ? (
                <img src={previewUrl} alt="QR preview" className="dm-upload-preview" />
              ) : (
                <>
                  <span className="dm-upload-icon">
                    <Upload size={22} />
                  </span>
                  <span className="dm-upload-title">Tải ảnh QR lên</span>
                  <span className="dm-upload-hint">JPG, PNG · tối đa 5MB</span>
                </>
              )}
            </button>

            {previewUrl ? (
              <button
                type="button"
                className="dm-reupload"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={13} /> Chọn ảnh khác
              </button>
            ) : null}

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
            <button
              type="button"
              className="dm-btn dm-btn--primary"
              disabled={sending}
              onClick={() => void handleSend()}
            >
              {sending ? "Đang tạo…" : "Tạo lệnh"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
