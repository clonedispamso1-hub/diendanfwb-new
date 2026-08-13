/**
 * CommunityVipModal — CẦU NỐI tới popup duy nhất VipUnlockModal.
 * Giữ nguyên API cũ (region / adminOnly / onJoin) để không phải sửa call-site.
 */
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";

export interface CommunityVipModalProps {
  open: boolean;
  region?: string | null;
  adminOnly?: boolean;
  onClose: () => void;
  onJoin?: () => void;
}

export function CommunityVipModal({ open, onClose }: CommunityVipModalProps) {
  return <VipUnlockModal open={open} onClose={onClose} />;
}

export default CommunityVipModal;
