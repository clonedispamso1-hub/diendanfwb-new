/**
 * vip-status — NGUỒN XÁC ĐỊNH DUY NHẤT cho "user này có phải VIP không".
 *
 * ⚠️ KHÔNG tạo VIP giả ở frontend. Trạng thái VIP được đọc từ dữ liệu hồ sơ
 * hiện có (bảng `profiles`, cột `vip_level` / `is_vip` / hạn VIP nếu có),
 * đi qua `profile-cache` sẵn có nên KHÔNG thêm request/egress mới, KHÔNG đụng
 * tới RPC, Auth, Gem/Xu hay kiến trúc Supabase hiện tại.
 *
 * Quy ước dữ liệu cũ của hệ thống:
 *   • Mọi tài khoản mặc định `vip_level = 1` → KHÔNG phải VIP.
 *   • VIP thật sự: `vip_level >= 2` hoặc `is_vip = true`.
 *   • Nếu hồ sơ có cột hạn VIP (`vip_until` / `vip_expires_at` / `vip_expire_at`)
 *     và đã hết hạn → KHÔNG còn là VIP.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { fetchProfileById, peekProfile, PROFILE_UI_COLS } from "@/lib/profile-cache";
import {
  getCachedCloneVipMedia,
  requestCloneVipMedia,
  subscribeCloneVipMedia,
} from "@/lib/clone-vip-media";
import {
  getCachedVipIcon,
  requestVipIcon,
  subscribeVipIcons,
} from "@/lib/vip-assets";

export type VipProfileLike = {
  vip_level?: number | null;
  is_vip?: boolean | null;
  vip_until?: string | null;
  vip_expires_at?: string | null;
  vip_expire_at?: string | null;
} | null | undefined;

/** Ngưỡng VIP: level 1 là mặc định của mọi tài khoản nên VIP bắt đầu từ 2. */
export const VIP_MIN_LEVEL = 2;

function stillValid(profile: NonNullable<VipProfileLike>): boolean {
  const raw =
    (profile as any).vip_until ??
    (profile as any).vip_expires_at ??
    (profile as any).vip_expire_at ??
    null;
  if (!raw) return true; // hệ thống không dùng hạn VIP → bỏ qua
  const t = new Date(raw as string).getTime();
  if (!Number.isFinite(t)) return true;
  return t > Date.now();
}

/** Kiểm tra VIP từ một object hồ sơ đã có sẵn (không gọi mạng). */
export function isVipProfile(profile: VipProfileLike): boolean {
  if (!profile) return false;
  if (!stillValid(profile)) return false;
  if (profile.is_vip === true) return true;
  return Number(profile.vip_level ?? 0) >= VIP_MIN_LEVEL;
}

/** Có đủ thông tin VIP trong object này chưa? (để biết cần tra cứu thêm không) */
export function hasVipInfo(profile: VipProfileLike): boolean {
  if (!profile) return false;
  return profile.vip_level !== undefined || profile.is_vip !== undefined;
}

/**
 * useIsVip — trạng thái VIP của một user.
 *
 * @param userId  id người dùng (null → không VIP)
 * @param hint    object hồ sơ đã có sẵn ở call site (feed/comment/chat thường
 *                đã kèm `vip_level`) → dùng luôn, không tra cứu thêm.
 */
export function useIsVip(userId?: string | null, hint?: VipProfileLike): boolean {
  const hinted = hasVipInfo(hint) ? isVipProfile(hint) : null;

  const [vip, setVip] = useState<boolean>(() => {
    if (hinted !== null) return hinted;
    if (!userId) return false;
    const cached = peekProfile(userId, PROFILE_UI_COLS);
    return cached ? isVipProfile(cached as VipProfileLike) : false;
  });

  useEffect(() => {
    if (hinted !== null) {
      setVip(hinted);
      return;
    }
    if (!userId) {
      setVip(false);
      return;
    }
    const cached = peekProfile(userId, PROFILE_UI_COLS);
    if (cached) {
      setVip(isVipProfile(cached as VipProfileLike));
      return;
    }
    let alive = true;
    void fetchProfileById(userId, PROFILE_UI_COLS)
      .then((row) => {
        if (alive) setVip(isVipProfile(row as VipProfileLike));
      })
      .catch(() => { /* im lặng — không VIP */ });
    return () => { alive = false; };
  }, [userId, hinted]);

  // ĐỒNG BỘ: tên có icon VIP (vip_media / vip_icons) ⇒ khung avatar VIP cũng bật.
  const nameIcon = useHasVipNameIcon(userId);

  return vip || nameIcon;
}

/* ------------------------------------------------------------------ *
 * Icon VIP sau tên = NGUỒN CHUNG với khung avatar.
 *
 * Tên người dùng hiện icon VIP khi:
 *   • profiles.vip_media có media gán (CloneVipNameMedia), hoặc
 *   • bảng vip_icons gán icon cho user (VipIconBadge).
 * Khung avatar VIP phải bật đúng theo hai nguồn đó, không được lệch.
 * ------------------------------------------------------------------ */

function subscribeVipNameIcon(cb: () => void) {
  const offMedia = subscribeCloneVipMedia(cb);
  const offIcons = subscribeVipIcons(cb);
  return () => {
    offMedia();
    offIcons();
  };
}

/** true nếu user đang hiển thị icon VIP ngay sau tên. */
export function useHasVipNameIcon(userId?: string | null): boolean {
  const has = useSyncExternalStore(
    subscribeVipNameIcon,
    () => {
      if (!userId) return false;
      const media = getCachedCloneVipMedia(userId);
      if (media && media.length > 0) return true;
      return !!getCachedVipIcon(userId);
    },
    () => false,
  );

  useEffect(() => {
    if (!userId) return;
    requestCloneVipMedia(userId);
    requestVipIcon(userId);
  }, [userId]);

  return has;
}
