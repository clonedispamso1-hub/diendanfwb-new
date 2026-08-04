import type { FakeLocale } from "@/integrations/supabase/fake-types";

/* ============================================================
 * Bộ tên NỮ theo 5 ngôn ngữ (CN/JP/KR ưu tiên ký tự gốc)
 * ============================================================ */

const NAMES: Record<FakeLocale, string[]> = {
  ja: [
    "ひなた", "さくら", "ゆき", "あおい", "みお", "りん", "はな", "ゆい",
    "かおり", "まりん", "あかり", "つばき", "みつき", "りこ", "さき",
    "Sakura", "Yuki", "Hina", "Mei", "Aoi", "Hana", "Mio",
  ],
  ko: [
    "민지", "지수", "예린", "수빈", "혜진", "채원", "서연", "유나",
    "지아", "은하", "도연", "원영", "예지", "하니", "리아",
    "Jisoo", "Mina", "Yuna", "Seoyeon", "Chaewon",
  ],
  en: [
    "Luna", "Aria", "Mia", "Ella", "Nova", "Ivy", "Ruby", "Skye",
    "Zoey", "Hazel", "Iris", "Willow", "Lyra", "Sage", "Wren",
    "Quinn", "Eden", "Pearl", "Stella", "Violet",
  ],
  zh: [
    "妍洋", "雪儿", "晓琳", "丽丽", "美玲", "婷婷", "佳怡", "心怡",
    "若曦", "诗雨", "梦琪", "紫涵", "可欣", "雨桐", "语嫣",
    "XiaoLin", "Mei", "LiLi",
  ],
  vi: [
    "Thanh Xuân", "Bảo Châu", "Mỹ Linh", "Hạ Vy", "Quỳnh Anh",
    "Khả Hân", "Diệu Linh", "Phương Thảo", "Tú Anh", "Ngọc Trinh",
    "Như Quỳnh", "Hồng Nhung", "Bích Phương", "Minh Châu", "Tuệ Lâm",
    "Hoài An", "Kiều My", "Thuỳ Tiên", "Anh Thư", "Lan Hương",
  ],
};

/* ============================================================
 * Phân phối ngôn ngữ — 30% CN/JP/KR (10/10/10), 40% VI, 30% EN
 * ============================================================ */
function pickLocaleSmart(): FakeLocale {
  const r = Math.random() * 100;
  if (r < 10) return "zh";
  if (r < 20) return "ja";
  if (r < 30) return "ko";
  if (r < 70) return "vi";
  return "en";
}

/* ============================================================
 * Style transformers — biến chữ thường thành các font nghệ thuật
 * Chỉ áp dụng cho A-Z/a-z; ký tự khác giữ nguyên (an toàn cho VN/Nhật/Hàn/Trung).
 * ============================================================ */

const ALPHA = /[A-Za-z]/g;

function transformLatin(input: string, mapUpper: string, mapLower: string): string {
  return input.replace(ALPHA, (ch) => {
    const code = ch.charCodeAt(0);
    if (ch >= "A" && ch <= "Z") return mapUpper[code - 65] ?? ch;
    if (ch >= "a" && ch <= "z") return mapLower[code - 97] ?? ch;
    return ch;
  });
}

// Mathematical bold script (𝓐𝓑𝓒) – cần 2 code units
function toBoldScript(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90)       out += String.fromCodePoint(0x1D4D0 + (c - 65));
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1D4EA + (c - 97));
    else                           out += ch;
  }
  return out;
}

// Mathematical bold italic 𝓪𝓫𝓬 (đã có ở trên là script). Thêm fraktur 𝔄𝔅
function toFraktur(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90)       out += String.fromCodePoint(0x1D504 + (c - 65));
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1D51E + (c - 97));
    else                           out += ch;
  }
  return out;
}

const SMALL_CAPS_UPPER = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
const SMALL_CAPS_LOWER = SMALL_CAPS_UPPER; // dùng chung

function toSmallCaps(s: string): string {
  return transformLatin(s, SMALL_CAPS_UPPER, SMALL_CAPS_LOWER);
}

// Trang trí ๖ۣۜ kiểu game thủ
const ORNATE_PREFIX = ["๖ۣۜ", "༺", "꧁", "★彡", "☪︎", "⚝"];
const ORNATE_SUFFIX_CHARS = ["༻", "꧂", "彡★"];

function withOrnate(s: string): string {
  const p = pick(ORNATE_PREFIX);
  // chỉ thêm suffix nếu prefix có cặp
  if (p === "༺") return `༺ ${s} ༻`;
  if (p === "꧁") return `꧁ ${s} ꧂`;
  if (p === "★彡") return `★彡 ${s} 彡★`;
  return `${p}${s}`;
}

/* ============================================================
 * Decorations (emoji nữ tính)
 * ============================================================ */

const CUTE_SUFFIXES = [
  "🌸", "✨", "🎀", "💗", "💕", "🌷", "🍓", "🦋", "🫧", "🌙",
  "♡", "✿", "⋆", "✧", "❀", "☆", "ღ", "ᰔ", "·˚", ".ᐟ",
];

const KANA_SUFFIX = ["ゆき", "さくら", "もも", "ひな", "あい", "ちゃん"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybe<T>(value: T, prob = 0.5): T | "" {
  return Math.random() < prob ? value : "";
}

/** Có ký tự latin trong chuỗi không (để áp font nghệ thuật) */
function hasLatin(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

/* ============================================================
 * Tạo username + display_name (NỮ, ngẫu nhiên, đa ngôn ngữ)
 * ============================================================ */

export function generateFakeIdentity(locale?: FakeLocale): {
  username: string;
  displayName: string;
  locale: FakeLocale;
} {
  const loc = locale ?? pickLocaleSmart();
  const base = pick(NAMES[loc]);

  // username: ASCII-friendly, độc nhất – dùng cho field "username"
  const slugBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
  const slugSeed = slugBase.toLowerCase() || "girl";
  const slug = `${slugSeed}_${Math.random().toString(36).slice(2, 7)}`;

  // display_name: chỉ stylize khi có ký tự latin (tránh phá CN/JP/KR)
  const latinStyles: Array<(s: string) => string> = [
    (s) => `${toBoldScript(s)} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${toSmallCaps(s)} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${withOrnate(toBoldScript(s))}`,
    (s) => `${withOrnate(s)} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${toFraktur(s)} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${s} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${pick(CUTE_SUFFIXES)} ${toBoldScript(s)} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${toBoldScript(s)} ${pick(KANA_SUFFIX)}`,
  ];
  const cjkStyles: Array<(s: string) => string> = [
    (s) => `${s} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${pick(CUTE_SUFFIXES)} ${s}`,
    (s) => `${pick(CUTE_SUFFIXES)} ${s} ${pick(CUTE_SUFFIXES)}`,
    (s) => `${s}${maybe(pick(CUTE_SUFFIXES), 0.6)}`,
  ];

  const styles = hasLatin(base) ? latinStyles : cjkStyles;
  let displayName = pick(styles)(base);

  // Đảm bảo độ dài hợp lý
  if (displayName.length > 40) displayName = displayName.slice(0, 40);

  return { username: slug, displayName, locale: loc };
}

/* ============================================================
 * Bộ avatar anime/aesthetic (~50 URL CDN)
 * Sử dụng các CDN miễn phí có sẵn ảnh anime/aesthetic.
 * ============================================================ */

const AVATAR_POOL: string[] = [
  // Picsum aesthetic portraits (rộng rãi, nhanh)
  ...Array.from({ length: 18 }, (_, i) =>
    `https://picsum.photos/seed/anime${i + 1}/240/240`,
  ),
  // DiceBear anime-style (lorelei, micah, adventurer, notionists)
  ...["lorelei", "micah", "adventurer", "notionists", "thumbs"].flatMap((style) =>
    Array.from({ length: 6 }, (_, i) =>
      `https://api.dicebear.com/7.x/${style}/png?seed=fwb-${style}-${i}&backgroundColor=ffd1dc,fce4ec,f8bbd0,ffe0e9`,
    ),
  ),
];

export function pickFakeAvatar(): string {
  return pick(AVATAR_POOL);
}

/* ============================================================
 * Sinh hàng loạt – tối ưu cho 100~1000 records
 * ============================================================ */

export interface NewFakeProfile {
  username: string;
  display_name: string;
  avatar_url: string;
  locale: FakeLocale;
  vip_level?: number;
}

/**
 * VIP distribution dùng để buff "sang chảnh hơn".
 *  - diamond  → vip_level 10 (kim cương)
 *  - gold     → vip_level 5  (vàng)
 *  - silver   → vip_level 2  (bạc)
 *  - none     → vip_level 0
 */
export interface VipDistribution {
  diamondPct?: number; // %
  goldPct?: number;
  silverPct?: number;
}

function rollVipLevel(dist: VipDistribution): number {
  const d = Math.max(0, dist.diamondPct ?? 0);
  const g = Math.max(0, dist.goldPct ?? 0);
  const s = Math.max(0, dist.silverPct ?? 0);
  const r = Math.random() * 100;
  if (r < d) return 10;
  if (r < d + g) return 5;
  if (r < d + g + s) return 2;
  return 0;
}

export function generateFakeBatch(
  count: number,
  vipDist: VipDistribution = {},
): NewFakeProfile[] {
  const out: NewFakeProfile[] = [];
  const seen = new Set<string>();
  let safety = count * 3;
  while (out.length < count && safety-- > 0) {
    const id = generateFakeIdentity();
    if (seen.has(id.username)) continue;
    seen.add(id.username);
    out.push({
      username: id.username,
      display_name: id.displayName,
      avatar_url: pickFakeAvatar(),
      locale: id.locale,
      vip_level: rollVipLevel(vipDist),
    });
  }
  return out;
}
