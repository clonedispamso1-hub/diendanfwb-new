/**
 * BrandText — nguồn duy nhất cho tên thương hiệu website.
 * Sửa ở đây là toàn bộ website cập nhật theo.
 */
export const BRAND_NAME = "Diễn Đàn FWB";

interface BrandTextProps {
  /** Cỡ chữ (px). Mặc định 30px cho Header. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function BrandText({ size = 30, className = "", style }: BrandTextProps) {
  return (
    <span
      className={`brand-text ${className}`}
      data-text={BRAND_NAME}
      style={{
        fontSize: size,
        ...style,
      }}
    >
      {BRAND_NAME}
    </span>
  );
}
