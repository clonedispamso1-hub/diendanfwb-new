/**
 * LiveMocGateModal — CẦU NỐI tới popup duy nhất VipUnlockModal (biến thể Live).
 */
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";

export function LiveMocGateModal({
  open,
  contactUrl,
  onClose,
}: {
  open: boolean;
  contactUrl?: string;
  onClose: () => void;
}) {
  return <VipUnlockModal open={open} onClose={onClose} variant="live" contactLink={contactUrl} />;
}

export default LiveMocGateModal;
