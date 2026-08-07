/**
 * Kích thước chuẩn cho Icon VIP / GIF theo từng ngữ cảnh.
 * Đổi số ở đây là đổi toàn bộ website (không hardcode trong component).
 *
 *   name     : huy hiệu GIF nhỏ đứng cạnh tên   22–26px (~1.25em)
 *   comment  : GIF gửi trong bình luận           120–180px (GIF thật)
 *   message  : GIF gửi trong tin nhắn            120–180px (GIF thật)
 *   sticker  : nhãn dán gửi riêng                160–220px
 *   post     : GIF trong bài viết (khung lớn)
 */
export type VipSizeContext = "name" | "comment" | "message" | "sticker" | "post";

export const VIP_SIZES: Record<VipSizeContext, { min: number; max: number }> = {
  // Huy hiệu cạnh tên: to hơn ~25% so với trước (18–20px).
  name: { min: 22, max: 26 },
  // GIF trong nội dung: hiển thị như GIF thật (giống Messenger/Facebook).
  comment: { min: 120, max: 180 },
  message: { min: 120, max: 180 },
  sticker: { min: 160, max: 220 },
  post: { min: 140, max: 320 },
};

/** Cạnh lớn nhất cho phép ở ngữ cảnh này. */
export function vipMaxSize(ctx: VipSizeContext): number {
  return VIP_SIZES[ctx].max;
}

/** Cạnh dùng cho icon vuông (lấy mốc dưới cho chắc chắn không phá layout). */
export function vipIconSize(ctx: VipSizeContext): number {
  return VIP_SIZES[ctx].min;
}
