/**
 * Quyền dùng tài nguyên VIP (Icon VIP / GIF VIP).
 *
 * Chỉ Admin, Super Admin và clone của "Tài khoản thứ hai"
 * (profiles.account_source = 'internal') mới được CHỌN / TẢI / DÙNG.
 * Thành viên thường: chỉ nhìn thấy icon hiển thị sau tên, không dùng được.
 */
import { useAuth } from "@/components/candy/auth-provider";

export const VIP_ICON_LOCK_NOTE = "⭐ Icon độc quyền của tài khoản Admin/Clone.";
export const VIP_GIF_LOCK_NOTE = "💎 Media VIP dành cho hệ thống.";

export function useVipAccess() {
  const { me, isAdmin } = useAuth();
  const isClone = (me as any)?.account_source === "internal";
  return { isAdmin, isClone, canUseVip: Boolean(isAdmin || isClone) };
}
