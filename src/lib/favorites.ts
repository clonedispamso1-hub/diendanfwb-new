/* ============================================================
   Yêu thích (Favorites)
   ------------------------------------------------------------
   Thay thế hoàn toàn hệ thống "Theo dõi" ở lớp UI.
   Dữ liệu vẫn dùng lại bảng `follows` cũ (1 row = 1 lượt yêu thích)
   nên không cần migration và không mất dữ liệu.

   Hiệu năng: chỉ là hàm thuần + helper format, không state, không
   subscription, không animation JS.
   ============================================================ */

/** Rút gọn số lượt yêu thích: 12 → "12", 1000 → "1K", 12500 → "12.5K", 1e6 → "1M" */
export function formatFavCount(n: number | null | undefined): string {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v >= 1_000_000_000) return `${trim(v / 1_000_000_000)}B`;
  if (v >= 1_000_000) return `${trim(v / 1_000_000)}M`;
  if (v >= 1_000) return `${trim(v / 1_000)}K`;
  return String(v);
}

function trim(x: number): string {
  // Giữ tối đa 1 chữ số thập phân, bỏ ".0" → 1K / 12.5K / 100K
  return x.toFixed(1).replace(/\.0$/, "");
}

/** Bậc viền avatar theo số lượt yêu thích (0..5) */
export type FavTier = 0 | 1 | 2 | 3 | 4 | 5;

export function favTier(count: number | null | undefined): FavTier {
  const v = Math.max(0, Math.floor(Number(count) || 0));
  if (v >= 100_000) return 5;
  if (v >= 10_000) return 4;
  if (v >= 1_000) return 3;
  if (v >= 100) return 2;
  if (v >= 10) return 1;
  return 0;
}

/** Câu hiển thị cho người xem khác (không lộ danh sách) */
export function favPublicSummary(count: number | null | undefined): string {
  return `Thành viên này hiện có ${formatFavCount(count)} lượt yêu thích`;
}

export const FAV_LABEL = "Yêu thích";
export const FAV_LABEL_ACTIVE = "Đã yêu thích";
export const FAV_LABEL_INBOUND = "Ai yêu thích tôi";
export const FAV_LABEL_OUTBOUND = "Tôi đã yêu thích";
