/**
 * UnlockLetter — UI thay thế popup "Cộng đồng VIP Zalo".
 * Chỉ UI/UX — logic & link Admin giữ nguyên (fetchCommunityPage).
 */
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

export interface UnlockLetterProps {
  open: boolean;
  onClose: () => void;
  /** Giữ tương thích API cũ — dữ liệu luôn lấy từ "Quản lý Popup Chung". */
  adminProfileLink?: string;
  perks?: string[];
  featureName?: string;
  /** Biến thể popup; mặc định "zalo" vì đây là popup Cộng đồng VIP Zalo. */
  variant?: string;
}

/** UnlockLetter — CẦU NỐI tới popup DUY NHẤT CommonLockedPopup. */
export function UnlockLetter({ open, onClose, featureName, variant = "zalo" }: UnlockLetterProps) {
  // UnlockLetter LUÔN là popup "Cộng đồng VIP Zalo" → variant mặc định "zalo".
  return <CommonLockedPopup open={open} onClose={onClose} featureName={featureName} variant={variant} />;
}

/** Nút giữ nguyên luồng mở popup, chỉ có nhịp glow nhẹ khi đang hiện trên profile người khác. */
export function ZaloLockedButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ulk-locked-btn"
      aria-label="Kết bạn Zalo"
    >
      <span className="ulk-locked-btn__txt">Kết bạn Zalo</span>
    </button>
  );
}


export default UnlockLetter;