/**
 * VipCommunityPopup — CẦU NỐI tới popup duy nhất VipUnlockModal.
 * Giữ nguyên API cũ để không phải sửa call-site.
 */
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";
import type { VipVariantKey } from "@/lib/vip-unlock-config";

export interface VipCommunityPopupProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  featureLabel?: string;
  variant?: VipVariantKey;
  adminProfileLink?: string;
}

export function VipCommunityPopup({ open, onClose, title, message, variant, adminProfileLink }: VipCommunityPopupProps) {
  return (
    <VipUnlockModal
      open={open}
      onClose={onClose}
      variant={variant}
      title={title}
      message={message}
      contactLink={adminProfileLink}
    />
  );
}

export default VipCommunityPopup;
