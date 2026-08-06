/**
 * AppLoading — loading dùng chung toàn website.
 * Trái tim "Kết Nối Bí Mật": heartbeat + LED ring + glow.
 * Chỉ dùng CSS (transform / opacity / filter / box-shadow). Không canvas, lottie, webgl.
 */

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 20, md: 40, lg: 72 };

export function HeartLoader({ size = "md" }: { size?: Size }) {
  const px = SIZE_PX[size];
  return (
    <span className="app-heart" style={{ width: px, height: px }} aria-hidden="true">
      <span className="app-heart__ring" />
      <span className="app-heart__shape" />
    </span>
  );
}

export function AppLoading({
  label = "Đang tải...",
  size = "md",
  inline = false,
  className = "",
}: {
  label?: string | null;
  size?: Size;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`app-loading ${inline ? "app-loading--inline" : ""} ${className}`}
      role="status"
      aria-live="polite"
    >
      <HeartLoader size={size} />
      {label ? <span className="app-loading__label">{label}</span> : null}
    </div>
  );
}

/** Overlay che toàn màn hình cho các request async (login, đăng bài, ghép đôi...). */
export function AppLoadingOverlay({
  label = "Đang tải...",
  open = true,
}: {
  label?: string;
  open?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="app-loading-overlay" role="status" aria-live="polite">
      <div className="app-loading-overlay__card">
        <HeartLoader size="lg" />
        <span className="app-loading__label">{label}</span>
      </div>
    </div>
  );
}

/* ------------------------------ Skeleton ------------------------------ */

export function AppSkeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`app-skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Skeleton dạng dòng chữ: ██████ / ██████████ / ████████ */
export function AppSkeletonLines({ lines = 3 }: { lines?: number }) {
  const widths = ["62%", "92%", "78%", "84%", "56%"];
  return (
    <div className="app-skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <AppSkeleton key={i} style={{ width: widths[i % widths.length], height: 12 }} />
      ))}
    </div>
  );
}

/** Skeleton card cho profile / feed. */
export function AppSkeletonCard({ avatar = true, lines = 3 }: { avatar?: boolean; lines?: number }) {
  return (
    <div className="app-skeleton-card" aria-hidden="true">
      {avatar && <AppSkeleton className="app-skeleton--circle" style={{ width: 48, height: 48 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <AppSkeletonLines lines={lines} />
      </div>
    </div>
  );
}

export default AppLoading;
