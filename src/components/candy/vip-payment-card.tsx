/** Card lệnh nạp hiển thị trong chat và sheet chi tiết thanh toán. */
import { useEffect, useState } from "react";
import {
  Banknote,
  Check,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  CreditCard,
  Download,
  FileText,
  Landmark,
  LockKeyhole,
  UserRound,
  X,
} from "lucide-react";
import { Portal } from "@/components/candy/portal";
import {
  formatCountdown,
  formatVipAmount,
  type VipPaymentPayload,
} from "@/lib/vip-payment";

function useTimeLeft(expiresAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, (expiresAt || 0) - now);
}

const detailIcons = {
  bank: Landmark,
  account: CreditCard,
  holder: UserRound,
  note: FileText,
  amount: Coins,
};

function CopyRow({
  label,
  value,
  big,
  icon,
  disabled = false,
}: {
  label: string;
  value: string;
  big?: boolean;
  icon: keyof typeof detailIcons;
  disabled?: boolean;
}) {
  const [done, setDone] = useState(false);
  const Icon = detailIcons[icon];
  const copy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard bị chặn — bỏ qua */
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className="vps-row">
      <span className="vps-row-icon" aria-hidden="true"><Icon size={17} /></span>
      <div className="vps-row-main">
        <span className="vps-label">{label}</span>
        <span className={`vps-value${big ? " is-amount" : ""}`}>{value || "—"}</span>
      </div>
      <button
        type="button"
        className="vps-copy"
        onClick={copy}
        aria-label={disabled ? `${label} đã bị khóa` : `Sao chép ${label}`}
        disabled={disabled}
      >
        {disabled ? <LockKeyhole size={13} /> : done ? <Check size={13} /> : <Copy size={13} />}
        {disabled ? "Đã khóa" : done ? "Đã chép" : "Copy"}
      </button>
    </div>
  );
}

/** Bottom sheet chi tiết lệnh thanh toán. */
export function VipPaymentSheet({
  data,
  timeLeft,
  open,
  onClose,
}: {
  data: VipPaymentPayload;
  timeLeft: number;
  open: boolean;
  onClose: () => void;
}) {
  const expired = timeLeft <= 0;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

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
        <div className="dm-card vps-card" role="dialog" aria-modal="true" aria-labelledby="vps-payment-title">
          <div className="dm-handle" aria-hidden="true" />
          <button
            type="button"
            className="dm-close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            aria-label="Đóng chi tiết lệnh nạp"
          >
            <X size={18} />
          </button>

          <div className="vps-head">
            <span className="vps-head-icon" aria-hidden="true">
              <Banknote size={20} />
            </span>
            <span className="vps-heading">
              <span className="vps-kicker">Admin Zalo</span>
              <h2 id="vps-payment-title" className="vps-title">Tham Gia</h2>
            </span>
            <span className="vps-state">
              <span className={`vps-status${expired ? " is-expired" : ""}`}>
                {expired ? <LockKeyhole size={12} aria-hidden="true" /> : <span className="vps-status-dot" aria-hidden="true" />}
                {expired ? "Hết thời gian chuyển khoản" : "Đang hiệu lực"}
              </span>
              <span className={`vps-timer${expired ? " is-expired" : ""}`}>
                <Clock size={12} />
                 {expired ? "00:00" : formatCountdown(timeLeft)}
              </span>
            </span>
          </div>

          <div className="vps-body dm-body">
            {data.qrUrl ? (
              <div className="vps-qr">
                <span className="vps-section-label">Mã QR thanh toán</span>
                <img src={data.qrUrl} alt="Mã QR chuyển khoản" loading="lazy" />
                <span className="vps-qr-hint">Quét mã QR bằng app ngân hàng để chuyển khoản</span>
                <a className="vps-qr-download" href={data.qrUrl} download="ma-qr-thanh-toan" target="_blank" rel="noreferrer">
                  <Download size={15} aria-hidden="true" /> Tải QR
                </a>
              </div>
            ) : null}

            {expired ? (
              <div className="vps-expired-notice" role="status">
                <LockKeyhole size={17} aria-hidden="true" />
                Lệnh đã bị khóa. Vui lòng không tiếp tục chuyển khoản.
              </div>
            ) : null}

            <section className="vps-payment-section" aria-label="Thông tin thanh toán">
              <h3 className="vps-section-title">Thông tin thanh toán</h3>
              <div className="vps-details">
              <CopyRow label="Ngân hàng" value={data.bank} icon="bank" disabled={expired} />
              <CopyRow label="Số tài khoản" value={data.account} icon="account" disabled={expired} />
              <CopyRow label="Tên người nhận" value={data.holder} icon="holder" disabled={expired} />
              <CopyRow label="Nội dung chuyển khoản" value={data.note} icon="note" disabled={expired} />
              <CopyRow label="Số tiền cần chuyển" value={formatVipAmount(data.amount)} big icon="amount" disabled={expired} />
              </div>
            </section>

            <section className="vps-note-section" aria-labelledby="vps-note-title">
              <h3 id="vps-note-title" className="vps-section-title">Lưu ý thanh toán</h3>
              <div className="vps-notes">
                <span className="vps-note"><Check size={13} aria-hidden="true" /> Thanh toán trong thời gian đúng hạn</span>
                <span className="vps-note"><Check size={13} aria-hidden="true" /> Thanh toán đúng nội dung giao dịch</span>
                <span className="vps-note"><Check size={13} aria-hidden="true" /> Khi hết thời gian giao dịch vui lòng không chuyển khoản</span>
                <span className="vps-note"><Check size={13} aria-hidden="true" /> Sai nội dung chuyển khoản bên mình sẽ không hỗ trợ</span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Card lệnh nạp hiển thị trong bong bóng chat. */
export function VipPaymentCard({ data }: { data: VipPaymentPayload }) {
  const [open, setOpen] = useState(false);
  const left = useTimeLeft(data.expiresAt);
  const expired = left <= 0;

  return (
    <>
      <button
        type="button"
        className="vpc"
        onClick={() => setOpen(true)}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Xem thông tin thanh toán VIP Zalo"
      >
        <div className="vpc-inner">
          <span className="vpc-check" aria-hidden="true"><Check size={22} strokeWidth={3} /></span>
          <span className="vpc-copy">
            <strong className="vpc-title">Tham Gia Vip Zalo</strong>
            <span className="vpc-cta">Nhấn vào xem thông tin chi tiết</span>
            <span className={`vpc-meta${expired ? " is-expired" : ""}`}>
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              {expired ? "Hết thời gian" : `Còn ${formatCountdown(left)}`}
            </span>
          </span>
          <span className="vpc-side">
            <span className="vpc-arrow" aria-hidden="true"><ChevronRight size={18} /></span>
          </span>
        </div>
      </button>

      <VipPaymentSheet data={data} timeLeft={left} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
