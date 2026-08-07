/**
 * Admin — "Quản Lý Icon VIP": NGUỒN DUY NHẤT của toàn bộ Media VIP
 * (Icon / GIF / WEBM / MP4) cho Admin và Tài khoản thứ hai.
 *
 * Dữ liệu: public.vip_icons · Cloudinary: vip/icons/*
 * Hoàn toàn độc lập với Kho GIF dùng chung (gif_library).
 */
import { VipMediaManager } from "./VipMediaManager";

export function VipIconManager() {
  return (
    <VipMediaManager
      title="Quản Lý Icon VIP (kho Media VIP duy nhất)"
      description="Nơi duy nhất quản lý toàn bộ Media VIP: Icon, GIF, WEBM, MP4. Dùng cho GIF sau tên, gán clone, tạo clone hàng loạt, và nút GIF VIP khi clone đăng bài / bình luận / nhắn tin. KHÔNG dùng chung dữ liệu với Kho GIF."
    />
  );
}

export default VipIconManager;
