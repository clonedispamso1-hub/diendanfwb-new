/** Số ngày lịch (theo giờ máy admin) từ ngày đăng ký (profiles.created_at) đến hôm nay. */
export function daysSinceJoined(createdAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Bộ lọc "Số ngày" — các khoảng không giao nhau (ngày 15 thuộc "Lâu dài"). */
export type DaysFilter = "all" | "new" | "mid" | "long";
export const DAYS_FILTERS: [DaysFilter, string][] = [
  ["all", "Số ngày: Tất cả"],
  ["new", "Mới (1–5 ngày)"],
  ["mid", "Trung bình (10–14 ngày)"],
  ["long", "Lâu dài (15–30 ngày)"],
];
const RANGES: Record<Exclude<DaysFilter, "all">, [number, number]> = {
  new: [1, 5],
  mid: [10, 14],
  long: [15, 30],
};
export function matchesDaysFilter(days: number | null, f: DaysFilter): boolean {
  if (f === "all") return true;
  if (days === null) return false;
  const [a, b] = RANGES[f];
  return days >= a && days <= b;
}

/** Phân trang SAU khi lọc: trả trang (0-based, đã kẹp) + tổng trang. */
export function paginate<T>(list: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  return { page: p, totalPages, total: list.length, items: list.slice(p * size, p * size + size) };
}
