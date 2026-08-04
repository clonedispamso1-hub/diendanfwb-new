/**
 * Tìm kiếm tỉnh/thành với bí danh (alias) đầy đủ.
 * Mọi màn hình có ô tìm tỉnh/thành đều dùng chung file này.
 */
import { VN_PROVINCES } from "@/lib/vn-provinces";

/** Bỏ dấu tiếng Việt, chuẩn hoá khoảng trắng, chữ thường. */
export function normalizeVi(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[.,\-–—_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bí danh thủ công (đã normalize) cho các tỉnh/thành có tên gọi dân gian. */
const MANUAL_ALIASES: Record<string, string[]> = {
  "tp ho chi minh": [
    "hcm", "tphcm", "tp hcm", "hcmc", "sai gon", "saigon", "sg",
    "ho chi minh", "thanh pho ho chi minh", "tp ho chi minh",
  ],
  "ba ria vung tau": ["vung tau", "ba ria", "brvt", "vt"],
  "thua thien hue": ["hue", "tp hue", "thanh pho hue"],
  "ha noi": ["hn", "thu do", "ha thanh"],
  "da nang": ["dn", "da nang"],
  "hai phong": ["hp", "dat cang"],
  "can tho": ["ct", "tay do"],
  "khanh hoa": ["nha trang"],
  "lam dong": ["da lat", "dalat"],
  "quang ninh": ["ha long"],
  "nghe an": ["vinh"],
  "binh dinh": ["quy nhon", "qui nhon"],
  "dak lak": ["buon ma thuot", "bmt", "daklak", "dac lac"],
  "dak nong": ["gia nghia", "daknong"],
  "thanh hoa": ["tp thanh hoa"],
  "an giang": ["long xuyen", "chau doc"],
  "kien giang": ["rach gia", "phu quoc"],
  "dong nai": ["bien hoa"],
  "binh duong": ["thu dau mot", "di an", "thuan an"],
  "quang nam": ["hoi an", "tam ky"],
};

/** Tất cả bí danh (đã normalize) của 1 tỉnh: tên gốc + biến thể tiền tố + viết tắt. */
export function aliasesFor(name: string): string[] {
  const n = normalizeVi(name);
  const bare = n.replace(/^(tp|thanh pho|tinh)\s+/, "");
  const set = new Set<string>([n, bare]);
  // biến thể tiền tố
  for (const p of ["tp", "tp ", "thanh pho", "tinh"]) {
    set.add(`${p.trim()} ${bare}`.replace(/\s+/g, " ").trim());
  }
  set.add(bare.replace(/\s+/g, "")); // "hochiminh", "danang"
  set.add(`tp${bare.replace(/\s+/g, "")}`);
  // viết tắt chữ cái đầu
  const words = bare.split(" ").filter(Boolean);
  if (words.length > 1) set.add(words.map((w) => w[0]).join(""));
  for (const a of MANUAL_ALIASES[n] || MANUAL_ALIASES[bare] || []) set.add(a);
  return [...set].filter(Boolean);
}

const ALIAS_CACHE = new Map<string, string[]>(
  VN_PROVINCES.map((p) => [p, aliasesFor(p)] as const),
);

/** Điểm khớp; <= 0 nghĩa là không khớp. */
export function scoreProvince(name: string, rawQuery: string): number {
  const q = normalizeVi(rawQuery);
  if (!q) return 1;
  const qBare = q.replace(/^(tp|thanh pho|tinh)\s+/, "");
  const haystacks = ALIAS_CACHE.get(name) ?? aliasesFor(name);

  let best = -1;
  for (const h of haystacks) {
    for (const needle of new Set([q, qBare, q.replace(/\s+/g, "")])) {
      if (!needle) continue;
      if (h === needle) best = Math.max(best, 1000);
      else if (h.startsWith(needle)) best = Math.max(best, 500);
      else if (h.split(" ").some((w) => w.startsWith(needle))) best = Math.max(best, 300);
      else if (h.includes(needle)) best = Math.max(best, 100);
    }
  }
  return best;
}

/** Danh sách tỉnh khớp truy vấn, đã sắp xếp. */
export function searchProvinces(query: string): string[] {
  return VN_PROVINCES.map((name) => ({ name, score: scoreProvince(name, query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name, "vi")))
    .map((s) => s.name);
}
