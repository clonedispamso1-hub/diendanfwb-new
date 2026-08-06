/**
 * vn-locations.ts — province + district data for the matching-board picker.
 *
 * Only the busiest cities get a curated district list. Every other province
 * falls back to a single "Toàn tỉnh" option so the picker never dead-ends.
 * Reused across FWB / ONS / Dating pages.
 */
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { districtsOf } from "@/lib/vn-districts";

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
    "Thủ Dầu Một", "Thuận An", "Dĩ An", "Tân Uyên", "Bến Cát",
    "Bàu Bàng", "Bắc Tân Uyên", "Phú Giáo", "Dầu Tiếng",
  ],
  "Đồng Nai": [
    "Biên Hòa", "Long Khánh", "Trảng Bom", "Long Thành", "Nhơn Trạch",
  ],
  "Bà Rịa - Vũng Tàu": [
    "Vũng Tàu", "Bà Rịa", "Phú Mỹ", "Long Điền", "Đất Đỏ",
    "Xuyên Mộc", "Châu Đức", "Côn Đảo",
  ],
  "Nha Trang": ["Trung tâm", "Vĩnh Hải", "Vĩnh Nguyên", "Vĩnh Trường"],
};

function normLoc(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/(tinh|thanh pho|tp\.?|quan|huyen|thi xa)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Dò tên tỉnh/thành từ chuỗi khu vực tự do của user ("Bà Rịa", "tp vũng tàu"…).
 * Trả về tên tỉnh chuẩn, hoặc chuỗi gốc nếu không khớp.
 */
export function resolveProvince(input: string): string {
  const key = normLoc(input);
  if (!key) return input;
  const provinces = [...Object.keys(DISTRICTS_BY_PROVINCE), ...VN_PROVINCES];
  const exact = provinces.find((p) => normLoc(p) === key);
  if (exact) return exact;
  const partial = provinces.find((p) => normLoc(p).includes(key) || key.includes(normLoc(p)));
  if (partial) return partial;
  // Người dùng nhập tên quận/huyện → suy ra tỉnh chứa quận/huyện đó.
  for (const [prov, list] of Object.entries(DISTRICTS_BY_PROVINCE)) {
    if (list.some((d) => normLoc(d) === key)) return prov;
  }
  return input;
}

export function getDistricts(province: string): string[] {
  const resolved = resolveProvince(province);
  const curated = DISTRICTS_BY_PROVINCE[resolved];
  if (curated?.length) return curated;
  const fallback = districtsOf(resolved);
  return fallback.length && fallback[0] !== resolved ? fallback : ["Toàn tỉnh"];
}


/** All 63 provinces plus Nha Trang shortcut, for the "see all" grid. */
export const ALL_PROVINCES = VN_PROVINCES;
