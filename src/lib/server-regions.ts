import { normalizeVi } from "@/lib/province-search";
import { VN_PROVINCES } from "@/lib/vn-provinces";

export const REGIONS_BY_SERVER = {
  vn: VN_PROVINCES,
  tw: [
    "台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市",
    "新竹市", "基隆市", "彰化縣", "嘉義市",
  ],
  jp: [
    "東京都", "大阪府", "京都府", "愛知県", "神奈川県", "埼玉県",
    "千葉県", "兵庫県", "福岡県", "静岡県",
  ],
  us: [
    "California", "Texas", "Florida", "New York", "Washington", "Virginia",
    "Massachusetts", "Georgia", "Illinois", "Pennsylvania",
  ],
} as const;

export type RegionalServerId = keyof typeof REGIONS_BY_SERVER;

export function searchServerRegions(regions: readonly string[], query: string): string[] {
  const normalizedQuery = normalizeVi(query);
  if (!normalizedQuery) return [...regions];
  return regions.filter((region) => normalizeVi(region).includes(normalizedQuery));
}

export function stableRegionMemberCount(region: string, serverId: RegionalServerId): number {
  let hash = 5381;
  for (const character of `${serverId}:${region}`) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  const ranges: Record<RegionalServerId, readonly [number, number]> = {
    vn: [52, 328],
    tw: [38, 186],
    jp: [32, 164],
    us: [24, 142],
  };
  const [minimum, maximum] = ranges[serverId];
  return minimum + (hash % (maximum - minimum + 1));
}

/**
 * Số "Online" GIẢ LẬP, hoàn toàn client-side: deterministic theo (sever, region)
 * qua hash djb2 → ổn định giữa các lần render, không random lại, không state,
 * không API/Supabase/storage. Khoảng 100–500 cho mọi sever.
 */
export function stableOnlineCount(severId: string, region: string): number {
  let hash = 5381;
  for (const character of `online:${severId}:${region}`) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return 100 + (hash % 401);
}
/* ---------- Sever selector + author location detection (frontend only) ---------- */

export const EXTRA_REGIONS = {
  kr: ["서울", "부산", "인천", "대구", "대전", "광주", "울산", "경기도", "제주도", "Seoul", "Busan"],
  cn: ["北京", "上海", "广州", "深圳", "成都", "杭州", "重庆", "武汉", "西安", "Beijing", "Shanghai"],
} as const;

export type SeverId = "mixed" | RegionalServerId | keyof typeof EXTRA_REGIONS;

export interface SeverOption {
  id: SeverId;
  flag: string;
  label: string;
}

export const SEVERS: readonly SeverOption[] = [
  { id: "mixed", flag: "🇻🇳", label: "Sever Hỗn Tạp (Sống)" },
  { id: "vn", flag: "🇻🇳", label: "Sever Việt Nam" },
  { id: "tw", flag: "🇹🇼", label: "Sever Đài Loan" },
  { id: "jp", flag: "🇯🇵", label: "Sever Nhật Bản" },
  { id: "kr", flag: "🇰🇷", label: "Sever Hàn Quốc" },
  { id: "cn", flag: "🇨🇳", label: "Sever China" },
  { id: "us", flag: "🇺🇸", label: "Sever US" },
];

export function regionsOfSever(id: SeverId): readonly string[] {
  if (id === "mixed") return [];
  if (id === "kr" || id === "cn") return EXTRA_REGIONS[id];
  return REGIONS_BY_SERVER[id];
}

const COUNTRY_HINTS: Record<Exclude<SeverId, "mixed">, string[]> = {
  vn: ["viet nam", "vietnam"],
  tw: ["dai loan", "taiwan", "台灣", "台湾"],
  jp: ["nhat ban", "japan", "日本"],
  kr: ["han quoc", "korea", "한국"],
  cn: ["trung quoc", "china", "中国"],
  us: ["usa", "united states", "my", "hoa ky"],
};

/**
 * Detects the author's Sever from their own registered profile location
 * (profiles.province, falling back to profiles.location). Never uses the viewer.
 */
export function detectMemberSever(
  province: string | null | undefined,
  location?: string | null,
): { sever: SeverOption; region: string } | null {
  const raw = (province || "").trim() || (location || "").trim();
  if (!raw) return null;
  const q = normalizeVi(raw);
  const order: Exclude<SeverId, "mixed">[] = ["vn", "tw", "jp", "kr", "cn", "us"];
  for (const id of order) {
    const hit = regionsOfSever(id).find((r) => {
      const n = normalizeVi(r);
      return n === q || (n.length > 2 && (q.includes(n) || n.includes(q)));
    });
    const hint = COUNTRY_HINTS[id].some((h) => q === h || q.includes(h));
    if (hit || hint) {
      return { sever: SEVERS.find((s) => s.id === id)!, region: hit ?? raw };
    }
  }
  return { sever: SEVERS.find((s) => s.id === "vn")!, region: raw };
}
