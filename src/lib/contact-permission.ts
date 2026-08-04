/**
 * Quyền mở Facebook / Zalo của chủ bài viết hoặc chủ trang cá nhân.
 *
 * Quy tắc:
 *  - Chủ sở hữu là ADMIN  -> mọi người đều mở được, không cần VIP.
 *  - Chủ sở hữu là user thường:
 *      + Chính chủ            -> luôn mở được.
 *      + Người xem là admin   -> mở được.
 *      + Người xem là VIP     -> mở được.
 *      + Còn lại              -> hiện popup Cộng Đồng VIP.
 */

export interface ContactActor {
  id?: string | null;
  is_admin?: boolean | null;
  vip_level?: number | null;
}

/** Thành viên Cộng Đồng VIP: vip_level >= 2 (level 1 là mặc định của mọi tài khoản). */
export function isVipMember(actor?: ContactActor | null): boolean {
  return Number(actor?.vip_level ?? 0) >= 2;
}

export function canOpenContact(
  viewer?: ContactActor | null,
  owner?: ContactActor | null,
): boolean {
  if (owner?.is_admin === true) return true;
  if (viewer?.id && owner?.id && viewer.id === owner.id) return true;
  if (viewer?.is_admin === true) return true;
  return isVipMember(viewer);
}
