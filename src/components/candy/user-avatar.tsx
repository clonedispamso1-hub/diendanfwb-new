import { memo, useState, type CSSProperties } from "react";
import { avatarSrc, disableStorageTransform, isStorageTransformUrl, storageOriginalUrl } from "@/lib/image-cdn";

/**
 * UserAvatar — shared, consistent avatar rendering across the whole app.
 *
 * Guarantees:
 *  - Perfectly circular (border-radius: 50%)
 *  - Strict 1:1 aspect ratio (no card height inflation from tall/wide images)
 *  - object-fit: cover + center — no stretching, no distortion
 *  - overflow hidden — never leaks outside the circle
 *  - Consistent size at every call site
 */
export type AvatarRankTier = "gold" | "silver" | "bronze" | "default";

export interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  ring?: boolean;
  fallbackText?: string;
  /**
   * Optional colored border tinted by leaderboard rank.
   *   "gold"    → Top 1
   *   "silver"  → Top 2–3
   *   "bronze"  → Top 4–10
   *   "default" / undefined → subtle neutral ring (matches ring=true)
   */
  rankTier?: AvatarRankTier;
}

const PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23e5e7eb'/><circle cx='32' cy='26' r='12' fill='%239ca3af'/><path d='M8 60c4-12 16-18 24-18s20 6 24 18' fill='%239ca3af'/></svg>";

const RANK_RING: Record<AvatarRankTier, { color: string; glow: string } | null> = {
  gold:    { color: "#f5b301", glow: "0 0 0 2px #fff, 0 0 0 4px #f5b301, 0 0 14px -2px rgba(245,179,1,0.7)" },
  silver:  { color: "#a8b3c1", glow: "0 0 0 2px #fff, 0 0 0 4px #a8b3c1, 0 0 12px -3px rgba(168,179,193,0.55)" },
  bronze:  { color: "#c07a3a", glow: "0 0 0 2px #fff, 0 0 0 3px #c07a3a" },
  default: null,
};

export const UserAvatar = memo(function UserAvatar({
  src,
  alt = "",
  size = 40,
  className = "",
  style,
  onClick,
  ring = false,
  fallbackText,
  rankTier,
}: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  // Ảnh nhỏ hơn ~10x so với ảnh gốc → giảm mạnh Egress avatar.
  const optimized = avatarSrc(src, size);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const finalSrc = failedFor === optimized ? storageOriginalUrl(optimized) : optimized;
  const showFallback = !src || errored;
  const dim = `${size}px`;

  const rankRing = rankTier ? RANK_RING[rankTier] : null;
  const ringShadow = rankRing?.glow
    ?? (ring ? "0 0 0 2px hsl(var(--background)), 0 0 0 3px hsl(var(--border))" : undefined);

  const wrapperStyle: CSSProperties = {
    width: dim,
    height: dim,
    minWidth: dim,
    minHeight: dim,
    aspectRatio: "1 / 1",
    borderRadius: "50%",
    overflow: "hidden",
    display: "inline-block",
    position: "relative",
    flexShrink: 0,
    background: "hsl(var(--muted))",
    boxShadow: ringShadow,
    cursor: onClick ? "pointer" : undefined,
    ...style,
  };

  const imgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
    borderRadius: "50%",
  };

  const initials = (fallbackText || alt || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={className}
      style={wrapperStyle}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? alt || "avatar" : undefined}
    >
      {showFallback ? (
        <span
          style={{
            ...imgStyle,
            display: "grid",
            placeItems: "center",
            color: "hsl(var(--muted-foreground))",
            fontSize: Math.max(12, size * 0.4),
            fontWeight: 700,
            background: `url("${PLACEHOLDER}") center/cover no-repeat, hsl(var(--muted))`,
          }}
          aria-hidden="true"
        >
          {src ? "" : initials}
        </span>
      ) : (
        <img loading="lazy" decoding="async"
          src={finalSrc}
          alt={alt}
          draggable={false}
          onError={() => {
            // Project chưa bật resize ảnh phía Storage → quay lại URL gốc.
            if (isStorageTransformUrl(finalSrc)) {
              disableStorageTransform();
              setFailedFor(optimized);
              return;
            }
            setErrored(true);
          }}
          style={imgStyle}
        />
      )}
    </span>
  );
});
