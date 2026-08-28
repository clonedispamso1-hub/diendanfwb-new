import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Pencil, History, Flag } from "lucide-react";

interface ProfileMenuSheetProps {
  open: boolean;
  onClose: () => void;
  isOwn: boolean;
  onEdit: () => void;
  onLogout: () => void;
  onReport?: () => void;
  /** Có phải admin không — quyết định hiển thị mục "Quản lý thành viên". */
  isAdmin?: boolean;
  /** Callback điều hướng sang trang quản trị (chỉ áp dụng khi isAdmin && isOwn). */
  onOpenAdmin?: () => void;
  /** Điều hướng tới trang "Lịch sử tài khoản" (thông tin công khai) của người đang xem. */
  onOpenAccountHistory?: () => void;
  /** Deprecated / no-op — sub-profile FWB đã bị loại bỏ. */
  fwbModeActive?: boolean;
  onToggleFwbMode?: () => void;
  /** Deprecated — chức năng Chặn đã bị gỡ khỏi toàn hệ thống. */
  onBlock?: () => void;
  onOpenBlocked?: () => void;
}

/**
 * Bottom sheet 3-dot menu (Facebook-style).
 * Own profile  : Chỉnh sửa · Đổi thông tin · Nhóm Zalo/FB · Hỗ trợ · (Admin) · Đăng xuất.
 * Other profile: Tố cáo.
 * (Chức năng Chặn đã được gỡ hoàn toàn theo yêu cầu launch.)
 */
export function ProfileMenuSheet({
  open,
  onClose,
  isOwn,
  onEdit,
  onLogout,
  onReport,
  isAdmin,
  onOpenAdmin,
  onOpenAccountHistory,
  fwbModeActive: _fwbModeActive,
  onToggleFwbMode: _onToggleFwbMode,
  onBlock: _onBlock,
  onOpenBlocked: _onOpenBlocked,
}: ProfileMenuSheetProps) {
  // no-op placeholders — legacy props kept for backward compatibility
  void onLogout; void isAdmin; void onOpenAdmin;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] p-0 border-t bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300"
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted" />
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-base font-semibold">Tuỳ chọn</h3>
          {/* Nút X mặc định do <SheetContent> render ở góc trên phải — không thêm nút thứ 2. */}
        </div>
        <div className="flex flex-col px-2 pb-6">
          {isOwn ? (
            <>
              <MenuItem
                icon={<Pencil size={18} />}
                label="Cập nhật hồ sơ"
                description="Cập nhật ảnh đại diện, tên hiển thị, giới thiệu"
                onClick={() => { onClose(); onEdit(); }}
              />
              <MenuItem
                icon={<History size={18} />}
                label="Lịch sử tài khoản"
                description="Xem thông tin công khai của tài khoản"
                onClick={() => { onClose(); onOpenAccountHistory?.(); }}
              />
            </>
          ) : (
            <>
              <MenuItem
                icon={<History size={18} />}
                label="Lịch sử tài khoản"
                description="Xem thông tin công khai của tài khoản"
                onClick={() => { onClose(); onOpenAccountHistory?.(); }}
              />
              {onReport ? (
                <MenuItem
                  icon={<Flag size={18} />}
                  label="Tố cáo"
                  description="Gửi tố cáo vi phạm để nhận thưởng"
                  tone="danger"
                  onClick={() => { onClose(); onReport(); }}
                />
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuItem({
  icon, label, description, onClick, tone,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  tone?: "danger" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/70 active:scale-[0.99] ${tone === "danger" ? "text-destructive" : tone === "accent" ? "text-amber-700 dark:text-amber-300" : ""}`}
    >
      <span
        className={`grid place-items-center h-10 w-10 rounded-full ${tone === "danger" ? "bg-destructive/10" : tone === "accent" ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-muted"}`}
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
