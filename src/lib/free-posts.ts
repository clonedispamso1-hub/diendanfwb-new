/** Tổng số lượt đăng bài miễn phí mỗi tài khoản (server quyết định, xem SQL SB1 2026-10-18). */
export const FREE_POST_TOTAL = 20;

/** Chuỗi hiệu ứng cộng lượt: +1, +2, … +total. */
export function freePostSteps(total: number = FREE_POST_TOTAL): string[] {
  return Array.from({ length: Math.max(0, Math.floor(total)) }, (_, i) => `+${i + 1}`);
}
