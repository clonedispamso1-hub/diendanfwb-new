/**
 * ZaloVipLockModal — nay chỉ là CẦU NỐI tới Popup Engine dùng chung.
 * Mọi tính năng VIP (Kết bạn Zalo, Xem số Zalo, Live, Nhóm VIP, Set kèo,
 * Offline…) đều dùng chung một popup duy nhất, nội dung chỉnh trong Admin.
 */
import { useEffect } from "react";
import { openPopup } from "@/components/candy/popup-engine";

export interface ZaloVipLockModalProps {
  open: boolean;
  title?: string;
  message?: string;
  /** popup_key trong Admin Panel (mặc định: vip_zalo). */
  popupKey?: string;
  onClose: () => void;
}

export function ZaloVipLockModal({
  open,
  title,
  message,
  popupKey = "vip_zalo",
  onClose,
}: ZaloVipLockModalProps) {
  useEffect(() => {
    if (!open) return;
    openPopup(popupKey, {
      overrides: {
        ...(title ? { title } : {}),
        ...(message ? { content: message } : {}),
      },
      onClose,
      onConfirm: onClose,
    });
  }, [open, popupKey, title, message, onClose]);

  return null;
}

export default ZaloVipLockModal;
