import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { avatarVariant } from "@/lib/image-cdn";
import { useRankTier, type RankTier } from "@/lib/rank-glow";
import { LiveBadge } from "@/components/candy/live/live-badge";

interface AvatarGlowProps {
  /** URL avatar của user. NULL/empty = hiển thị fallback. */
  avatar?: string | null;
  /** ID người dùng — dùng để chọn màu glow theo thứ hạng (Task #4.7). */
  userId?: string | null;
  /** Kích thước cạnh (px) của avatar. */
  size?: number;
  /** Alt text cho avatar. */
  alt?: string;
  /** Class thêm cho container ngoài cùng. */
  className?: string;
  /** Class thêm cho ảnh avatar. */
  imgClassName?: string;
  /** Nội dung fallback (khi không có avatar). Mặc định là ký tự đầu của alt. */
  fallback?: React.ReactNode;
  /** Style thêm cho container. */
  style?: React.CSSProperties;
  /** Bấm vào avatar. */
  onClick?: () => void;
  /** Tắt hiệu ứng glow. Mặc định BẬT. */
  disableGlow?: boolean;
  /** @deprecated (Task #4.6) — Avatar Frame đã bị gỡ, prop này bị bỏ qua. */
  frame?: string | null;
}

const TIER_CLASS: Record<Exclude<RankTier, null>, string> = {
  follow1: "avatar-glow--follow1",
  follow2: "avatar-glow--follow2",
  follow3: "avatar-glow--follow3",
  rising1: "avatar-glow--rising1",
};

/**
 * AvatarGlow — avatar tròn với hiệu ứng phát sáng (Task #4.6 + #4.7).
 *
 * Màu glow được chọn theo thứ hạng (ưu tiên cao → thấp):
 *   🟡 Top Follow #1  · 🟣 Rising #1 · 🔴 Rising #2 · 🟢 Rising #3 · ⚪ mặc định
 *
 * UI-only: không đụng vào DB, RPC, Wallet, Notification hay logic khác.
 */
export function AvatarGlow({
  avatar,
  userId,
  size = 40,
  alt = "",
  className = "",
  imgClassName = "",
  fallback,
  style,
  onClick,
  disableGlow = false,
}: AvatarGlowProps) {
  const tier = useRankTier(userId);

  const fallbackNode =
    fallback ?? (alt ? alt.trim().charAt(0).toUpperCase() : "?");

  const clickable = onClick
    ? { onClick, role: "button" as const, tabIndex: 0 }
    : {};

  const pulseClass = disableGlow ? "" : " avatar-glow--pulse";
  const tierClass = tier ? ` ${TIER_CLASS[tier]}` : "";

  return (
    <span
      {...clickable}
      className={`avatar-glow${pulseClass}${tierClass} ${className}`}
      style={{
        width: size,
        height: size,
        position: "relative",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {avatar ? (
        <img loading="lazy" decoding="async"
          width={size}
          height={size}
          src={avatarVariant(getValidAvatarUrl(avatar), size)}
          onError={handleAvatarError}
          alt={alt}
          className={`avatar-glow__img ${imgClassName}`}
          draggable={false}
        />
      ) : (
        <span
          className={`avatar-glow__img avatar-glow__fallback ${imgClassName}`}
          aria-label={alt}
        >
          {fallbackNode}
        </span>
      )}
      <LiveBadge userId={userId} size={size >= 64 ? "md" : "sm"} />
    </span>
  );
}

export default AvatarGlow;
