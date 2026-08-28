/**
 * HeartLoader — trạng thái đang tải / lỗi (chỉ UI, không gọi API).
 * Icon trái tim xoay nhẹ + pulse glow, canh giữa màn hình, mobile & desktop.
 */
import { Heart } from "lucide-react";
import "@/styles/heart-loader.css";

export function HeartLoader({
  label = "Đang tải hồ sơ…",
  inline = false,
  size = 56,
}: {
  label?: string;
  inline?: boolean;
  size?: number;
}) {
  return (
    <div
      className={`heart-loader${inline ? " heart-loader-inline" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Heart className="heart-loader-icon" size={size} strokeWidth={2.2} fill="currentColor" />
      <span className="heart-loader-text">{label}</span>
    </div>
  );
}

export function HeartLoadError({
  label = "Không tải được hồ sơ này. Vui lòng thử lại.",
  onRetry,
  inline = false,
}: {
  label?: string;
  onRetry?: () => void;
  inline?: boolean;
}) {
  return (
    <div className={`heart-loader${inline ? " heart-loader-inline" : ""}`} role="alert">
      <Heart size={52} strokeWidth={2.2} style={{ color: "#d1cfe0" }} fill="currentColor" />
      <span className="heart-loader-text">{label}</span>
      {onRetry ? (
        <button type="button" className="heart-loader-retry" onClick={onRetry}>
          Thử lại
        </button>
      ) : null}
    </div>
  );
}
