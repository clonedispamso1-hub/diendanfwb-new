/**
 * HƯỚNG DẪN ADMIN THEO KHU VỰC (cấp TỈNH/THÀNH PHỐ).
 *
 * - 8 mục cố định (tên không đổi, Admin chỉ nhập nội dung).
 * - Nội dung lưu vĩnh viễn trong Supabase: bảng public.admin_site_settings,
 *   key = "crm_guide_region_sections", value = { [tỉnh]: { [mụcId]: nội dung } }.
 * - KHÔNG tạo bảng mới, dùng đúng nơi lưu sẵn có của hệ thống hướng dẫn.
 * - Khu vực luôn quy về cấp Tỉnh/Thành phố (bỏ Quận/Huyện).
 */
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { VN_PROVINCES } from "@/lib/vn-provinces";

const DB_KEY = "crm_guide_region_sections";
const CACHE_KEY = "crm.guide.regions.cache.v1";

/**
 * Phạm vi DÙNG CHUNG cho mọi khách hàng (không theo Tỉnh/Thành phố).
 * Dùng làm "khóa tỉnh" đặc biệt để tái sử dụng đúng nơi lưu hiện có.
 */
export const GLOBAL_SCOPE = "__global__";

/** 6 mục cấu hình dùng chung — KHÔNG hỏi khu vực. */
export const GLOBAL_SECTION_IDS: ReadonlySet<string> = new Set([
  "rg-quyen-loi",
  "rg-noi-quy",
  "rg-moi-phi",
  "rg-phi-khong-cao",
  "rg-feedback",
  "rg-so-tien",
]);

export interface RegionGuideItem {
  id: string;
  icon: string;
  label: string;
}

/** 8 mục cố định — tên KHÔNG được đổi. */
export const REGION_GUIDE_ITEMS: readonly RegionGuideItem[] = [
  { id: "rg-community-vip", icon: "👑", label: "Community VIP" },
  { id: "rg-quyen-loi", icon: "🎁", label: "Quyền lợi thành viên" },
  { id: "rg-noi-quy", icon: "📜", label: "Nội Quy CR" },
  { id: "rg-moi-phi", icon: "🪝", label: "Mồi Phí" },
  { id: "rg-phi-khong-cao", icon: "💸", label: "Phí không cao" },
  { id: "rg-feedback", icon: "🌟", label: "Mồi thành công" },
  { id: "rg-so-tien", icon: "💰", label: "Phí CR" },
  { id: "rg-dong-duoc-gi", icon: "🎯", label: "Là khi đóng được gì" },
] as const;

/** Map nội dung: { "Bình Dương": { "rg-noi-quy": "..." } } */
export type RegionGuideMap = Record<string, Record<string, string>>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(tp\.?|thanh pho|tinh)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const PROVINCE_INDEX = new Map(VN_PROVINCES.map((p) => [norm(p), p]));
// Một số cách viết phổ biến khác.
const ALIASES: Record<string, string> = {
  "ho chi minh": "TP. Hồ Chí Minh",
  hcm: "TP. Hồ Chí Minh",
  saigon: "TP. Hồ Chí Minh",
  "sai gon": "TP. Hồ Chí Minh",
  hue: "Thừa Thiên Huế",
  "ba ria vung tau": "Bà Rịa - Vũng Tàu",
};

/**
 * Quy mọi giá trị khu vực về TỈNH/THÀNH PHỐ.
 * "Bình Dương - Thủ Dầu Một", "Thủ Dầu Một, Bình Dương" → "Bình Dương".
 */
export function toProvince(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return "";
  if (value === GLOBAL_SCOPE) return GLOBAL_SCOPE;

  const direct = PROVINCE_INDEX.get(norm(value)) ?? ALIASES[norm(value)];
  if (direct) return direct;

  // Chuỗi ghép "Tỉnh - Quận/Huyện" hoặc "Quận/Huyện, Tỉnh".
  for (const part of value.split(/[-–,|/>]+/)) {
    const p = PROVINCE_INDEX.get(norm(part)) ?? ALIASES[norm(part)];
    if (p) return p;
  }

  // Tên tỉnh nằm trong chuỗi dài hơn.
  const n = ` ${norm(value)} `;
  for (const [key, province] of PROVINCE_INDEX) {
    if (n.includes(` ${key} `)) return province;
  }
  return "";
}

function isMap(v: unknown): v is RegionGuideMap {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function cachedRegionGuides(): RegionGuideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(map: RegionGuideMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Đọc toàn bộ nội dung theo khu vực từ Supabase. */
export async function fetchRegionGuides(): Promise<RegionGuideMap> {
  let value: unknown = null;

  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: DB_KEY });
  if (!error) value = rpcData;

  if (!isMap(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }

  const map = isMap(value) ? value : {};
  writeCache(map);
  return map;
}

/** Lưu nội dung 1 mục của 1 khu vực (giữ nguyên các khu vực khác). */
export async function persistRegionGuide(
  current: RegionGuideMap,
  province: string,
  sectionId: string,
  content: string,
): Promise<RegionGuideMap> {
  const p = toProvince(province);
  if (!p) throw new Error("Chưa chọn khu vực (Tỉnh/Thành phố).");
  const next: RegionGuideMap = {
    ...current,
    [p]: { ...(current[p] ?? {}), [sectionId]: content },
  };
  await adminSetSiteSetting(DB_KEY, next);
  writeCache(next);
  return next;
}

/** Nội dung đã lưu của 1 mục theo khu vực (rỗng nếu chưa nhập). */
export function regionGuideText(
  map: RegionGuideMap,
  province: string,
  sectionId: string,
): string {
  const p = toProvince(province);
  if (!p) return "";
  return map[p]?.[sectionId] ?? "";
}
