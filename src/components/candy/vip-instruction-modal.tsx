import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { Portal } from "@/components/candy/portal";

export interface VipInstructionModalProps {
  open: boolean;
  onClose: () => void;
}

export function VipInstructionModal({ open, onClose }: VipInstructionModalProps) {
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="ui-modal-overlay"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vip-instruction-title"
      >
        <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
          <button
            className="ui-modal-close"
            aria-label="Đóng"
            type="button"
            onClick={onClose}
          >
            ×
          </button>

          <div className="ui-modal-icon" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>

          <h2 id="vip-instruction-title">Vip Zalo Tham Gia</h2>
          <p>
            Liên hệ admin qua trang cá nhân để được duyệt và nhận link tham gia nhóm VIP Zalo.
          </p>

          <div className="ui-modal-actions">
            <button
              className="ui-modal-btn ui-modal-btn--primary"
              type="button"
              onClick={onClose}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default VipInstructionModal;
