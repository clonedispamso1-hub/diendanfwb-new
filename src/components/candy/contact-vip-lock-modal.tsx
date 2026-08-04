/**
 * Popup shown when a non-owner taps the Facebook / Zalo icon of a post.
 * Only VIP community members may see other members' contacts.
 */
import { createPortal } from "react-dom";
import { X, Crown } from "lucide-react";
import { ADMIN_CONTACT_URL } from "@/lib/contact-validation";

export interface ContactVipLockModalProps {
  open: boolean;
  onClose: () => void;
}

export function ContactVipLockModal({ open, onClose }: ContactVipLockModalProps) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="lm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mở khoá Facebook và Zalo"
    >
      <div className="lm-sheet lm-sheet--compact" onClick={(e) => e.stopPropagation()}>
        <div className="lm-sheet__head">
          <span className="lm-sheet__title">
            <span className="lm-envelope-badge" aria-hidden>
              <Crown size={16} color="#fff" />
            </span>
            Cộng Đồng VIP
          </span>
          <button className="lm-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
        <p className="lm-lock__text">
          Bạn vui lòng tham gia Cộng Đồng VIP để mở khóa tính năng xem Facebook và Zalo của thành viên.
        </p>
        <div className="lm-sheet__actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onClose}>
            Đóng
          </button>
          <a
            className="lm-btn lm-btn--primary"
            href={ADMIN_CONTACT_URL}
            rel="noopener noreferrer"
          >
            Liên hệ Admin
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ContactVipLockModal;
