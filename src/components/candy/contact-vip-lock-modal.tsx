/**
 * ContactVipLockModal — cầu nối tới Popup Engine dùng chung (popup_key: phone_view).
 */
import { useEffect } from "react";
import { openPopup } from "@/components/candy/popup-engine";

export interface ContactVipLockModalProps {
  open: boolean;
  popupKey?: string;
  onClose: () => void;
}

export function ContactVipLockModal({
  open,
  popupKey = "phone_view",
  onClose,
}: ContactVipLockModalProps) {
  useEffect(() => {
    if (!open) return;
    openPopup(popupKey, { onClose, onConfirm: onClose });
  }, [open, popupKey, onClose]);

  return null;
}

export default ContactVipLockModal;
