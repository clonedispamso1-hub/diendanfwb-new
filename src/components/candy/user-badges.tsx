/**
 * <UserBadges /> — LEGACY ALIAS.
 * Toàn bộ website chỉ dùng <UniversalBadge />. File này giữ lại để các
 * import cũ tiếp tục chạy và luôn render đúng 1 badge duy nhất.
 */
export {
  UniversalBadge as UserBadges,
  UniversalBadge,
  tierFromRank,
  useBestRank,
  default,
} from "@/components/candy/universal-badge";

export type {
  UniversalBadgeProfile as UserBadgesProfile,
  UniversalBadgeProps as UserBadgesProps,
  RankTier,
  RankTier as UserBadgeRankTier,
} from "@/components/candy/universal-badge";
