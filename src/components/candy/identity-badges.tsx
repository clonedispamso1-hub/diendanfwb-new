/**
 * IdentityBadges — LEGACY ALIAS → <UniversalBadge />.
 */
import UniversalBadge from "@/components/candy/universal-badge";

export type Tier = "new" | "long" | "official" | "top" | "admin";

export interface TierProfile {
  id?: string | null;
  created_at?: string | null;
  vip_level?: number | string | null;
  vip_permanent?: boolean | null;
  is_admin?: boolean | null;
  role?: string | null;
  badge_id?: string | null;
  is_virtual?: boolean | null;
  is_seed_account?: boolean | null;
  province?: string | null;
  location?: string | null;
}

/** No-op tier compute kept for backwards compatibility. */
export function computeTier(_p: unknown, _isTop: boolean): Tier {
  return "new";
}

export interface IdentityBadgesProps {
  profile: TierProfile | null | undefined;
  isTopOverride?: boolean;
  size?: number;
  gap?: number;
  className?: string;
  /** Ẩn Media VIP sau tên (khi trang tự render riêng để nằm sát tên). */
  hideVipMedia?: boolean;
}

export function IdentityBadges({
  profile,
  size = 20,
  gap = 5,
  className,
  hideVipMedia,
}: IdentityBadgesProps) {
  return (
    <UniversalBadge
      profile={profile ?? null}
      size={size}
      gap={gap}
      className={className}
      hideVipMedia={hideVipMedia}
    />
  );
}

export default IdentityBadges;
