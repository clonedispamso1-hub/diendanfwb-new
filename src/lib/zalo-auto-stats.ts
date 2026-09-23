/**
 * Tự tính Nam / Nữ / Key vàng / Key bạc từ TỔNG THÀNH VIÊN.
 *
 * Quy tắc (admin chỉ nhập tổng thành viên):
 * - Key vàng: tối đa 1, mặc định 1 khi tổng thành viên >= 1.
 * - Key bạc: tối đa 3, không vượt quá số người còn lại.
 * - Nam + Nữ + Key vàng + Key bạc = Tổng thành viên.
 * - Kết quả cố định (không random) → F5 vẫn giữ nguyên.
 */
import type { ZaloGroupStats } from "@/lib/zalo-group-stats";

export const AUTO_MAX_GOLD_KEY = 1;
export const AUTO_MAX_SILVER_KEY = 3;

export const toTotal = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

export function deriveGroupStats(total: unknown): ZaloGroupStats {
  const member_count = toTotal(total);
  const gold_key = member_count >= 1 ? AUTO_MAX_GOLD_KEY : 0;
  const silver_key = Math.max(0, Math.min(AUTO_MAX_SILVER_KEY, member_count - gold_key));
  const rest = Math.max(0, member_count - gold_key - silver_key);
  const men_count = Math.round(rest * 0.6);
  const women_count = rest - men_count;
  return { member_count, men_count, women_count, gold_key, silver_key };
}
