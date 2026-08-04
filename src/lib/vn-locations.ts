/**
 * vn-locations.ts — province + district data for the matching-board picker.
 *
 * Only the busiest cities get a curated district list. Every other province
 * falls back to a single "Toàn tỉnh" option so the picker never dead-ends.
 * Reused across FWB / ONS / Dating pages.
 */
import { VN_PROVINCES } from "@/lib/vn-provinces";

export interface ProvinceCard {
  name: string;
  emoji: string;
  /** Optional highlight badge shown on the card (e.g. "HOT"). */
  badge?: string;
}

/** Featured provinces rendered as big icon cards up top. */
export const FEATURED_PROVINCES: ProvinceCard[] = [
  { name: "Hà Nội",           emoji: "🏙️", badge: "HOT" },
  { name: "TP. Hồ Chí Minh",  emoji: "🌆", badge: "HOT" },
  { name: "Đà Nẵng",          emoji: "🌊" },
  { name: "Hải Phòng",        emoji: "⚓" },
  { name: "Cần Thơ",          emoji: "🌾" },
  { name: "Bình Dương",       emoji: "🏭" },
  { name: "Đồng Nai",         emoji: "🌳" },
  { name: "Nha Trang",        emoji: "🏖️" },
];

/** Districts for the busiest cities. Fallback = ["Toàn tỉnh"]. */
export const DISTRICTS_BY_PROVINCE: Record<string, string[]> = {
  "Hà Nội": [
    "Ba Đình", "Hoàn Kiếm", "Hai Bà Trưng", "Đống Đa", "Tây Hồ",
    "Cầu Giấy", "Thanh Xuân", "Hoàng Mai", "Long Biên", "Nam Từ Liêm",
    "Bắc Từ Liêm", "Hà Đông", "Gia Lâm", "Đông Anh", "Thanh Trì",
  ],
  "TP. Hồ Chí Minh": [
    "Quận 1", "Quận 2", "Quận 3", "Quận 4", "Quận 5",
    "Quận 6", "Quận 7", "Quận 8", "Quận 10", "Quận 11",
    "Quận 12", "Bình Thạnh", "Phú Nhuận", "Tân Bình", "Tân Phú",
    "Gò Vấp", "Bình Tân", "Thủ Đức", "Nhà Bè", "Hóc Môn",
  ],
  "Đà Nẵng": [
    "Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn", "Liên Chiểu",
    "Cẩm Lệ", "Hòa Vang",
  ],
  "Hải Phòng": [
    "Hồng Bàng", "Ngô Quyền", "Lê Chân", "Hải An", "Kiến An",
    "Đồ Sơn", "Dương Kinh",
  ],
  "Cần Thơ": [
    "Ninh Kiều", "Bình Thủy", "Cái Răng", "Ô Môn", "Thốt Nốt",
  ],
  "Bình Dương": [
    "Thủ Dầu Một", "Dĩ An", "Thuận An", "Bến Cát", "Tân Uyên",
  ],
  "Đồng Nai": [
    "Biên Hòa", "Long Khánh", "Trảng Bom", "Long Thành", "Nhơn Trạch",
  ],
  "Nha Trang": ["Trung tâm", "Vĩnh Hải", "Vĩnh Nguyên", "Vĩnh Trường"],
};

export function getDistricts(province: string): string[] {
  return DISTRICTS_BY_PROVINCE[province] ?? ["Toàn tỉnh"];
}

/** All 63 provinces plus Nha Trang shortcut, for the "see all" grid. */
export const ALL_PROVINCES = VN_PROVINCES;
