/**
 * FloatingZalo3D — logo Zalo 3D lơ lửng cố định ở góc dưới bên phải màn hình.
 *
 * - Fixed trên viewport, KHÔNG nằm trong PostCard, KHÔNG cuộn theo Feed.
 * - Mobile ~54px, đặt cách đáy ~80px (trên thanh Bottom Navigation).
 * - Desktop ~56px, góc dưới bên phải viewport.
 * - z-index cao để luôn nổi trên nội dung; không khung/nền/text.
 * - Hiệu ứng hover/nhấn rất nhẹ, không nhấp nháy.
 *
 * Chỉ render khi đang ở Trang chủ / Feed (tab "fwb"). Ẩn hoàn toàn trên
 * Tin nhắn, Hồ sơ, Feedback, Xu → Đại lý / Rút tiền (/wallet/withdraw) và
 * Tìm FWB — kiểm soát bằng route hiện tại, KHÔNG chỉ CSS che.
 */
import { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Zalo3DIcon } from "@/components/candy/zalo-3d-icon";
import { ZaloGroupsPrototype } from "@/components/candy/zalo-groups-prototype";
import { useAuth } from "@/components/candy/auth-provider";
import { useZaloFloatIcon } from "@/lib/zalo-float-icon";
import { useAlbumTabActive } from "@/lib/album-tab-flag";

/** Khớp logic pathToTab trong app-shell: tab "fwb" = Trang chủ / Feed.
 *  Bao gồm "/", "/u/:id" (overlay hồ sơ giữ tab Trang chủ), "/connect", "/pet",
 *  "/fwb", "/love" (legacy). Các tab khác → false. */
function isHomeFeed(pathname: string): boolean {
  if (pathname.startsWith("/feedback")) return false;
  if (pathname.startsWith("/chat")) return false;
  if (pathname.startsWith("/profile")) return false;
  // Trang Hồ sơ (overlay /u/:userId) — ẩn Zalo 3D, thay bằng nút Thẻ hồ sơ.
  if (pathname.startsWith("/u/")) return false;
  if (pathname.startsWith("/wallet/withdraw")) return false; // Xu → Đại lý / Rút tiền

  if (
    pathname.startsWith("/guide") ||
    pathname.startsWith("/ket-noi") ||
    pathname.startsWith("/huong-dan")
  )
    return false;
  if (pathname.startsWith("/find-fwb")) return false; // tab "Tìm FWB"
  // còn lại: "/", "/connect", "/pet", "/fwb", "/love" → Trang chủ feed
  return true;
}

export function FloatingZalo3D() {
  const { pathname } = useLocation();
  const { session, me } = useAuth();
  const [groupsOpen, setGroupsOpen] = useState(false);
  const closeGroups = useCallback(() => setGroupsOpen(false), []);
  // Ảnh + trạng thái Bật/Tắt do Admin cấu hình (Supabase #4, bảng zalo_float_icon).
  const { settings: icon, ready } = useZaloFloatIcon();
  // Tab Album dùng nút "+" riêng → ẩn icon Zalo nổi chỉ tại đây.
  const albumTab = useAlbumTabActive();

  // Chỉ hiển thị khi đã đăng nhập (có session + hồ sơ) và đang ở Trang chủ / Feed.
  // Khi đăng xuất → session = null → icon biến mất ngay.
  if (!session || !me) return null;
  if (!isHomeFeed(pathname)) return null;
  if (albumTab) return null;
  // Chưa đọc xong cấu hình → chưa render (tránh nháy icon mặc định).
  if (!ready) return null;
  // Admin tắt icon → ẩn hoàn toàn khỏi Trang Chủ.
  if (!icon.enabled) return null;
  return (
    <>
      <div className="floating-contact-stack" aria-label="Liên hệ nhanh">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="fz3d"
          aria-label="Mở Nhóm Zalo"
          aria-haspopup="dialog"
          aria-expanded={groupsOpen}
          onClick={() => setGroupsOpen(true)}
        >
          {icon.image_url ? (
            <img
              src={icon.image_url}
              alt="Nhóm Zalo"
              className="fz3d-custom-img"
              draggable={false}
            />
          ) : (
            <Zalo3DIcon />
          )}
        </Button>
      </div>
      <ZaloGroupsPrototype open={groupsOpen} onClose={closeGroups} />
    </>
  );
}
