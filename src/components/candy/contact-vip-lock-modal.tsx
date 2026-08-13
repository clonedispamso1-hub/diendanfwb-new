/**
 * ContactVipLockModal — CẦU NỐI tới popup duy nhất VipUnlockModal (biến thể "Xem số Zalo").
 */
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";

export interface ContactVipLockModalProps {
  open: boolean;
  /** Giữ tương thích API cũ — không còn dùng popup engine riêng. */
  popupKey?: string;
  onClose: () => void;
}

export function ContactVipLockModal({ open, onClose }: ContactVipLockModalProps) {
  return <VipUnlockModal open={open} onClose={onClose} variant="phone" />;
}

export default ContactVipLockModal;
