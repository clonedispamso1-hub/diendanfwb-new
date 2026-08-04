// Modal khoá tính năng – hiển thị hướng dẫn liên hệ Admin để tham gia nhóm Zalo VIP.
// KHÔNG có link tự động — nhóm VIP Zalo là nhóm riêng tư.
import { createPortal } from "react-dom";
import { X, Crown, MessageCircleWarning } from "lucide-react";

export interface ZaloVipLockModalProps {
  open: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
}

const DEFAULT_TITLE = "Tính năng dành riêng cho thành viên VIP";
const DEFAULT_MESSAGE =
  "Tính năng này chỉ dành cho thành viên nhóm VIP Zalo. Vui lòng liên hệ Admin để được hướng dẫn tham gia nhóm.";

export function ZaloVipLockModal({ open, title, message, onClose }: ZaloVipLockModalProps) {
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-fuchsia-500/15 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/80 backdrop-blur hover:bg-background"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-card/95 backdrop-blur p-6">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/40">
            <Crown className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-4 text-center text-lg font-bold">{title || DEFAULT_TITLE}</h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
            {message || DEFAULT_MESSAGE}
          </p>

          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
            <MessageCircleWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="font-bold">Cách tham gia nhóm VIP Zalo</div>
              <div className="mt-1 opacity-90">
                Liên hệ Admin thông qua <span className="font-semibold">Trung tâm trợ giúp</span>{" "}
                hoặc <span className="font-semibold">Tin nhắn hệ thống</span> để được hướng dẫn
                tham gia nhóm VIP Zalo.
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="mt-4 h-11 w-full rounded-full bg-foreground text-sm font-bold text-background hover:opacity-90"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ZaloVipLockModal;
