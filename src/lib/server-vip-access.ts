/**
 * Kiểm tra quyền vào server VIP theo khu vực (vn | tw | jp | us).
 * Mặc định mọi user = chưa VIP. vip_level = 1 là mặc định của mọi tài khoản,
 * nên chỉ vip_level >= 2, is_vip = true (còn hạn) hoặc admin mới có quyền.
 * Bấm vào tab KHÔNG bao giờ cấp quyền.
 */
import { isVipProfile } from "@/lib/vip-status";

export interface ServerVipUser {
  isAdmin?: boolean;
  vipLevel?: number | null;
  isVip?: boolean | null;
  vipUntil?: string | null;
}

export function hasServerVipAccess(user: ServerVipUser): boolean {
  if (user.isAdmin === true) return true;
  return isVipProfile({
    vip_level: user.vipLevel ?? null,
    is_vip: user.isVip ?? null,
    vip_until: user.vipUntil ?? null,
  });
}

export async function checkServerVipAccess(_serverId: string, user: ServerVipUser): Promise<boolean> {
  return hasServerVipAccess(user);
}
