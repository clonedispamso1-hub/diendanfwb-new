/**
 * Quy tắc thống kê thành viên của một nhóm Zalo (lớp 2).
 *
 * - Mỗi nhóm tối đa 6 admin.
 * - Key vàng: tối đa 1 người, mặc định 1 khi nhóm có admin.
 * - Key bạc: tối đa 5 người.
 * - Key vàng + key bạc <= 6 (chính là số admin của nhóm).
 * - Nam + nữ + số admin = tổng thành viên.
 *
 * Số liệu do admin nhập và lưu thẳng vào DB nên cố định, không random lại
 * khi hiển thị hay khi F5.
 */

export const MAX_ADMINS = 6;
export const MAX_GOLD_KEY = 1;
export const MAX_SILVER_KEY = 5;

export type ZaloGroupStats = {
  member_count: number;
  men_count: number;
  women_count: number;
  gold_key: number;
  silver_key: number;
};

/** Số nguyên >= 0. */
export const toCount = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

const clamp = (v: number, max: number) => Math.min(max, toCount(v));

/** Số admin của nhóm = key vàng + key bạc. */
export const adminCountOf = (s: Pick<ZaloGroupStats, "gold_key" | "silver_key">) =>
  toCount(s.gold_key) + toCount(s.silver_key);

/**
 * Chuẩn hoá số liệu về vùng hợp lệ (dùng khi admin đang gõ).
 * Không tự bịa dữ liệu: chỉ cắt về trần cho phép và cân lại nam/nữ khi
 * tổng thành viên bị giảm.
 */
export function normalizeGroupStats(
  input: ZaloGroupStats,
  changed?: keyof ZaloGroupStats,
): ZaloGroupStats {
  let gold = clamp(input.gold_key, MAX_GOLD_KEY);
  let silver = clamp(input.silver_key, MAX_SILVER_KEY);

  // Mặc định có 1 key vàng khi nhóm đã có admin.
  if (gold === 0 && silver > 0) gold = MAX_GOLD_KEY;
  // Tổng admin không vượt quá 6.
  if (gold + silver > MAX_ADMINS) silver = MAX_ADMINS - gold;

  const admins = gold + silver;
  let member = toCount(input.member_count);
  let men = toCount(input.men_count);
  let women = toCount(input.women_count);

  // Tổng thành viên không thể nhỏ hơn số admin.
  if (member < admins) member = changed === "member_count" ? member : admins;

  const capacity = Math.max(0, member - admins);

  if (changed === "men_count") {
    men = Math.min(men, capacity);
    women = Math.min(women, Math.max(0, capacity - men));
  } else if (changed === "women_count") {
    women = Math.min(women, capacity);
    men = Math.min(men, Math.max(0, capacity - women));
  } else {
    // Tổng/keys thay đổi: cắt nam trước, rồi tới nữ để không vượt sức chứa.
    men = Math.min(men, capacity);
    women = Math.min(women, Math.max(0, capacity - men));
  }

  return {
    member_count: member,
    men_count: men,
    women_count: women,
    gold_key: gold,
    silver_key: silver,
  };
}

/** Trả về lỗi đầu tiên (tiếng Việt) hoặc null nếu hợp lệ. */
export function validateGroupStats(s: ZaloGroupStats): string | null {
  const gold = toCount(s.gold_key);
  const silver = toCount(s.silver_key);
  const member = toCount(s.member_count);
  const men = toCount(s.men_count);
  const women = toCount(s.women_count);
  const admins = gold + silver;

  if (gold > MAX_GOLD_KEY) return `Key vàng tối đa ${MAX_GOLD_KEY} người.`;
  if (silver > MAX_SILVER_KEY) return `Key bạc tối đa ${MAX_SILVER_KEY} người.`;
  if (admins > MAX_ADMINS) return `Tổng key vàng + key bạc tối đa ${MAX_ADMINS} người.`;
  if (silver > 0 && gold < MAX_GOLD_KEY)
    return "Nhóm có admin phải có 1 key vàng.";
  if (men + women + admins > member)
    return `Nam + nữ + admin (${men + women + admins}) vượt quá tổng thành viên (${member}).`;
  if (men + women + admins !== member)
    return `Nam + nữ + admin (${men + women + admins}) phải bằng tổng thành viên (${member}).`;
  return null;
}
