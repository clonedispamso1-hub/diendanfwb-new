import { ChevronLeft } from "lucide-react";
import { Portal } from "@/components/candy/portal";

/**
 * "← Quay lại" dùng chung cho các màn hình dạng popup
 * (Feedback Detail, Chỉnh sửa trang cá nhân, Đổi mật khẩu).
 *
 * Nút được render qua Portal (document.body) + position: fixed nên KHÔNG bị
 * overflow:hidden / transform / stacking context của cha làm mất, và luôn nổi
 * trên mọi Dialog / Sheet / Drawer / Modal. Logic (onBack) giữ nguyên.
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
    <>
      {/* Chỗ trống giữ layout để nội dung không bị nút Back che. */}
      <div className="sticky-back-header sticky-back-header--spacer" aria-hidden="true">
        {title ? <span className="sticky-back-header__title">{title}</span> : null}
      </div>
      <Portal>
        <button
          type="button"
          className="sticky-back-header__btn sticky-back-header__btn--floating"
          onClick={onBack}
          aria-label={label}
        >
          <ChevronLeft size={24} strokeWidth={2.4} />
          <span>{label}</span>
        </button>
      </Portal>
    </>
  );
}

export default StickyBackHeader;
