/**
 * VipBadge — DEPRECATED alias.
 *
 * Toàn bộ website chỉ dùng <UniversalBadge />. Giữ file này để các import
 * cũ không vỡ build: nếu truyền `profile` thì render badge chuẩn, còn
 * không thì không render gì (tránh badge "lạ" khác chỗ khác).
 */
import UniversalBadge, {
  type UniversalBadgeProfile,
} from "@/components/candy/universal-badge";

export function VipBadge({
  profile,
}: {
  level?: number | null;
  gifUrl?: string | null;
  profile?: UniversalBadgeProfile | null;
}) {
  if (!profile) return null;
  return <UniversalBadge profile={profile} />;
}

export default VipBadge;
