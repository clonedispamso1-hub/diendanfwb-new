import { ChevronLeft } from "lucide-react";

/**
 * Sticky "← Quay lại" header dùng chung cho các màn hình dạng popup
 * (Feedback Detail, Chỉnh sửa trang cá nhân, Đổi mật khẩu).
 * Luôn dính trên cùng vùng cuộn, không bị header website đè.
 */
export function StickyBackHeader({
  onBack,
  label = "Quay lại",
  title,
}: {
  onBack: () => void;
  label?: string;
  title?: string;
}) {
  return (
    <div className="sticky-back-header">
      <button type="button" className="sticky-back-header__btn" onClick={onBack} aria-label={label}>
        <ChevronLeft size={24} strokeWidth={2.4} />
        <span>{label}</span>
      </button>
      {title ? <span className="sticky-back-header__title">{title}</span> : null}
    </div>
  );
}

export default StickyBackHeader;
