/**
 * ZaloVipLockModal — CẦU NỐI tới popup duy nhất VipUnlockModal (biến thể Kết bạn Zalo).
 */
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";
import type { VipVariantKey } from "@/lib/vip-unlock-config";

export interface ZaloVipLockModalProps {
  open: boolean;
  title?: string;
  message?: string;
  variant?: VipVariantKey;
  /** Giữ tương thích API cũ. */
  popupKey?: string;
  onClose: () => void;
}

export function ZaloVipLockModal({ open, title, message, variant = "zalo", onClose }: ZaloVipLockModalProps) {
  return <VipUnlockModal open={open} onClose={onClose} variant={variant} title={title} message={message} />;
}

export default ZaloVipLockModal;
