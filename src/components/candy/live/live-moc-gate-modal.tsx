// Popup Live Móc 🦋 — dùng chung style popup toàn site (ui-modal-*).
import { createPortal } from "react-dom";
import { X, MessageCircle } from "lucide-react";

export function LiveMocGateModal({
  open,
  contactUrl,
  onClose,
}: {
  open: boolean;
  contactUrl?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  const openAdmin = () => {
    if (contactUrl) window.open(contactUrl, "_blank", "noopener,noreferrer");
    onClose();
  };

  return createPortal(
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Thông báo"
      onClick={onClose}
    >
      <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ui-modal-icon" aria-hidden="true">
          <MessageCircle size={26} />
        </div>

        <h2>Thông báo</h2>
        <p>
          Bạn chưa tham gia <strong>Cộng đồng VIP Zalo khu vực của mình</strong> nên chưa thể sử
          dụng tính năng này.
          <br />
          Để được cấp quyền truy cập, vui lòng liên hệ Admin.
        </p>

        <div className="ui-modal-actions">
          <button
            type="button"
            className="ui-modal-btn ui-modal-btn--primary"
            onClick={openAdmin}
            disabled={!contactUrl}
          >
            <MessageCircle size={16} />
            <span>Liên hệ Admin</span>
          </button>
          <button type="button" className="ui-modal-btn ui-modal-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default LiveMocGateModal;