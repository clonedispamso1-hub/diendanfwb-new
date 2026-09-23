/**
 * VipAvatar / AvatarWithVipFrame — component DÙNG CHUNG cho khung avatar VIP.
 *
 * • User KHÔNG VIP → render avatar y như cũ, không thêm bất kỳ hiệu ứng nào.
 * • User VIP       → avatar gốc giữ nguyên + viền vàng và nhãn VIP nhỏ ở góc.
 *
 * Trạng thái VIP lấy từ dữ liệu hồ sơ hiện có (src/lib/vip-status.ts).
 */
import type { CSSProperties, ReactNode } from "react";
import { useIsVip, type VipProfileLike } from "@/lib/vip-status";
import "@/styles/vip-avatar-frame.css";

export interface VipAvatarProps {
  /** Id người dùng — dùng để tra trạng thái VIP thật từ hồ sơ. */
  userId?: string | null;
  /** Hồ sơ đã có sẵn ở call site (đã kèm vip_level) → khỏi tra cứu thêm. */
  profile?: VipProfileLike;
  /** Ép trạng thái VIP khi nơi gọi đã biết chắc (vẫn là dữ liệu thật). */
  vip?: boolean;
  /** Kích thước avatar (px) — khung sẽ tự scale theo. */
  size: number;
  /** Avatar gốc (không bị thay đổi). */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function VipAvatar({
  userId,
  profile,
  vip,
  size,
  children,
  className = "",
  style,
}: VipAvatarProps) {
  // Trạng thái VIP vẫn được tra cứu đúng (giữ logic + quyền lợi VIP),
  // nhưng phần hiển thị UI (viền vàng + nhãn "VIP" cạnh avatar) đã bị bỏ
  // theo yêu cầu — avatar VIP giờ hiển thị giống avatar thường.
  void useIsVip(userId, profile);
  void vip;
  void size;
  void className;
  void style;

  return <>{children}</>;
}

/** Alias theo tên gọi khác cho cùng một component. */
export const AvatarWithVipFrame = VipAvatar;

export default VipAvatar;
