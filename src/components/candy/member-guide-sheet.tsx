/**
 * MemberGuideSheet — popup "Hướng dẫn thành viên" dành riêng cho tài khoản Admin.
 *
 * Giai đoạn 1: chỉ hiển thị danh sách 7 mục (chưa có nội dung chi tiết,
 * chưa có chức năng chỉnh sửa). Mở từ mục "Hướng dẫn thành viên" ở menu
 * dấu cộng trong chat — menu này chỉ render khi isAdmin = true.
 */
import { ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/candy/bottom-sheet";
import { Portal } from "@/components/candy/portal";

export interface MemberGuideSection {
  id: string;
  label: string;
}

/** 7 mục cố định, đúng thứ tự yêu cầu. */
export const MEMBER_GUIDE_SECTIONS: MemberGuideSection[] = [
  { id: "fwb-ons", label: "FWB, ONS là gì" },
  { id: "member-count", label: "Số thành viên trong nhóm" },
  { id: "benefits", label: "Quyền lợi khi vào nhóm" },
  { id: "rules", label: "Nội quy nhóm" },
  { id: "fee-notice", label: "Thông báo phí nhóm" },
  { id: "fee-benefits", label: "Quyền lợi của đóng phí" },
  { id: "fee-amount", label: "Số tiền cần đóng vào nhóm" },
];

interface MemberGuideSheetProps {
  open: boolean;
  onClose: () => void;
  /** Gọi khi Admin chạm vào một mục (nội dung chi tiết sẽ nối vào sau). */
  onSelect?: (section: MemberGuideSection) => void;
}

export function MemberGuideSheet({ open, onClose, onSelect }: MemberGuideSheetProps) {
  return (
    <Portal>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Hướng dẫn thành viên"
        leftAction={<></>}
        height={80}
      >
        <ol className="mg-list">
          {MEMBER_GUIDE_SECTIONS.map((section, index) => (
            <li key={section.id}>
              <button
                type="button"
                className="mg-row"
                onClick={() => onSelect?.(section)}
              >
                <span className="mg-index" aria-hidden>
                  {index + 1}
                </span>
                <span className="mg-label">{section.label}</span>
                <ChevronRight size={16} className="mg-chevron" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <p className="mg-note">Nội dung chi tiết của từng mục sẽ được bổ sung sau.</p>
      </BottomSheet>
    </Portal>
  );
}

export default MemberGuideSheet;
