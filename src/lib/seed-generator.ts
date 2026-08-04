// Smart AI-assisted seed account generator.
//
// Produces realistic, social-media style Seed Account drafts. Nothing here
// writes to the database — the admin previews / edits before "Save All".
// Names span Vietnamese, Vietnamese nicknames, cute nicknames, emoji names,
// stylish Unicode, Simplified/Traditional Chinese, Japanese and Korean.
// Distributions try to feel natural: not every account gets emojis, not
// every account is Unicode.

import femaleAvatar1 from "@/assets/default-avatars/gioitinhnu1.jpg";
import femaleAvatar2 from "@/assets/default-avatars/gioitinhnu2.jpg";
import femaleAvatar3 from "@/assets/default-avatars/gioitinhnu3.jpg";
import femaleAvatar4 from "@/assets/default-avatars/gioitinhnu4.jpg";
import femaleAvatar5 from "@/assets/default-avatars/gioitinhnu5.jpg";

const LOCAL_FALLBACK_AVATARS = [
  femaleAvatar1, femaleAvatar2, femaleAvatar3, femaleAvatar4, femaleAvatar5,
];

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function removeDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

// Weighted random picker: entries = [value, weight]
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------
const VN_FIRST = [
  "Ngọc", "Bích", "Khả", "Thanh", "Mỹ", "Thiên", "Hà", "Thu", "Quỳnh", "Minh",
  "Phương", "Bảo", "Hoàng", "Kim", "Tú", "Diệu", "Thảo", "Nhật", "An", "Cẩm",
  "Linh", "Trúc", "Yến", "Hạnh", "Trang", "Vy", "Ý", "Tâm", "Nga", "Lan",
  "Gia", "Hải", "Vân", "Xuân", "Hồng", "Nhã", "Uyên", "Phụng",
];
const VN_LAST = [
  "Anh", "Diệu", "Hân", "Xuân", "Linh", "Kim", "My", "Trang", "Như", "Châu",
  "Trân", "Yến", "Ngân", "Quyên", "Vy", "Hạ", "Nhiên", "Tú", "Thy", "Phụng",
  "Khuê", "Đan", "Chi", "Tiên", "Hằng", "Băng", "Nhi", "Khanh", "Vân",
  "Bảo", "Hân", "Ngọc", "Mai",
];
const VN_NICKS_CUTE = [
  "Bơ", "Mỡ", "Mèo", "Bông", "Su", "Sữa", "Kem", "Kẹo", "Bí",
  "Nấm", "Xíu", "Bánh Bao", "Miu", "Na", "Thỏ", "Cún", "Heo",
  "Bí Ngô", "Trân Châu", "Bơ Sữa", "Kem Dâu",
];

// Chinese Simplified & Traditional style names.
const CN_SIMPLIFIED = [
  "小雨", "雨涵", "嘉宝", "美玲", "紫涵", "梦琪", "语嫣", "雅琳",
  "小柔", "念安", "书瑶", "晓彤", "若曦", "婉清", "静姝", "小可",
];
const CN_TRADITIONAL = [
  "曉彤", "書瑤", "詩涵", "夢琪", "語嫣", "雅琳", "若曦", "婉清",
  "靜姝", "小雅", "念安", "紫涵", "小柔", "美玲",
];

const JP_NAMES = ["リン", "ユナ", "ハナ", "ミサキ", "アイリ", "ユキ", "サクラ", "アオイ", "メイ", "ヒナ", "ナナ", "ユイ"];
const KR_NAMES = ["유나", "수진", "민지", "아라", "하윤", "세리", "지원", "채영", "혜리", "수빈", "지수", "예린"];

// Decorations — flowers, hearts, aesthetic marks. Applied to a subset only.
const DECOR_SUFFIX = ["🌷", "🌸", "🥑", "🍓", "☁️", "♡", "✨", "🎀", "🧸", "🌙", "🍑", "🦋"];

// Stylish Unicode transformer (partial — keeps names readable).
const STYLE_MAP: Record<string, string> = {
  a: "𝒶", b: "𝒷", c: "𝒸", d: "𝒹", e: "𝑒", f: "𝒻", g: "𝑔", h: "𝒽",
  i: "𝒾", j: "𝒿", k: "𝓀", l: "𝓁", m: "𝓂", n: "𝓃", o: "𝑜", p: "𝓅",
  q: "𝓆", r: "𝓇", s: "𝓈", t: "𝓉", u: "𝓊", v: "𝓋", w: "𝓌", x: "𝓍",
  y: "𝓎", z: "𝓏",
};
function stylize(s: string): string {
  return Array.from(s.toLowerCase()).map((c) => STYLE_MAP[c] ?? c).join("");
}

/**
 * Generate a single display name using a naturalistic distribution of
 * styles: mostly Vietnamese, with realistic minorities of nicknames, emoji
 * names, stylish Unicode, Chinese/Japanese/Korean, and Vietnamese + Chinese
 * mixes. Only a subset of results gets emojis or stylised glyphs — most
 * accounts look plain.
 */
export function generateDisplayName(): string {
  type Style =
    | "vn_full" | "vn_full_diacritics_off"
    | "vn_nick" | "vn_nick_emoji"
    | "vn_first_emoji"
    | "unicode_stylish"
    | "cn_simplified" | "cn_traditional"
    | "japanese" | "korean"
    | "vn_plus_cn";
  const style = weighted<Style>([
    ["vn_full", 26],
    ["vn_full_diacritics_off", 8],
    ["vn_nick", 8],
    ["vn_nick_emoji", 8],
    ["vn_first_emoji", 10],
    ["unicode_stylish", 5],
    ["cn_simplified", 10],
    ["cn_traditional", 5],
    ["japanese", 7],
    ["korean", 7],
    ["vn_plus_cn", 6],
  ]);

  const vnFull = () => `${pick(VN_FIRST)} ${pick(VN_LAST)}`;
  switch (style) {
    case "vn_full":                  return vnFull();
    case "vn_full_diacritics_off":   return removeDiacritics(vnFull());
    case "vn_nick":                  return pick(VN_NICKS_CUTE);
    case "vn_nick_emoji":            return `${pick(VN_NICKS_CUTE)} ${pick(DECOR_SUFFIX)}`;
    case "vn_first_emoji":           return `${pick(VN_FIRST)} ${pick(DECOR_SUFFIX)}`;
    case "unicode_stylish":          return stylize(`${pick(VN_FIRST)}${pick(VN_LAST)}`);
    case "cn_simplified":            return pick(CN_SIMPLIFIED);
    case "cn_traditional":           return pick(CN_TRADITIONAL);
    case "japanese":                 return pick(JP_NAMES);
    case "korean":                   return pick(KR_NAMES);
    case "vn_plus_cn":               return `${vnFull()} ${pick(CN_SIMPLIFIED)}`;
  }
}

// ---------------------------------------------------------------------
// Usernames
// ---------------------------------------------------------------------
const USERNAME_BASES = [
  "linh", "hana", "mei", "ngoc", "gia_bao", "yuna", "mia", "chi", "vy",
  "trang", "bo", "meo", "su", "bong", "an", "quyen", "nhu", "diep", "khue",
  "thao", "hanh", "phuong", "kim", "hy", "xuan", "hue", "my", "trucy",
];

/** Realistic social handles like linh_x82, hana_q7, mei_92, gia_bao9. */
export function generateUsername(taken: Set<string> = new Set()): string {
  for (let i = 0; i < 30; i++) {
    const base = pick(USERNAME_BASES);
    const styleR = Math.random();
    const letter = () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    let candidate: string;
    if (styleR < 0.35) candidate = `${base}_${letter()}${Math.floor(Math.random() * 90 + 10)}`;
    else if (styleR < 0.65) candidate = `${base}_${Math.floor(Math.random() * 90 + 10)}`;
    else if (styleR < 0.85) candidate = `${base}${Math.floor(Math.random() * 90 + 10)}`;
    else candidate = `${base}.${letter()}${Math.floor(Math.random() * 9 + 1)}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const fb = `${pick(USERNAME_BASES)}_${Date.now().toString(36).slice(-4)}`;
  taken.add(fb);
  return fb;
}

// ---------------------------------------------------------------------
// Bios (max 10 chars, multi-language, some empty)
// ---------------------------------------------------------------------
const BIO_VN = ["Cafe ☕", "Chill ✨", "Đơn giản", "Yên bình", "Bận rộn", "Cà phê", "Du lịch", "Vui vẻ", "Mèo 🐱", "Yêu đời"];
const BIO_CN_S = ["安静一下", "喜欢猫", "小确幸", "旅行控", "晚安 🌙"];
const BIO_CN_T = ["安靜一下", "喜歡貓", "旅行控", "晚安 🌙"];
const BIO_JP = ["おやすみ", "旅が好き", "猫が好き", "音楽 🎵"];
const BIO_KR = ["잘 자요", "여행 중", "고양이", "커피 ☕"];
const BIO_CUTE = ["Bơ 🥑", "Kem 🍦", "Mèo 🐾", "Bánh 🍰", "Sữa 🥛"];
const BIO_TRAVEL = ["Đi đâu?", "Wander ✈", "Sài Gòn"];
const BIO_LIFESTYLE = ["INFP", "Single", "Chill mode", "Zzz…"];

/** Short caption, max ~10 chars, ~25% empty. */
export function generateBio(): string {
  if (Math.random() < 0.22) return "";
  const pool = weighted<readonly string[]>([
    [BIO_VN, 40],
    [BIO_CUTE, 12],
    [BIO_CN_S, 10],
    [BIO_CN_T, 6],
    [BIO_JP, 8],
    [BIO_KR, 8],
    [BIO_TRAVEL, 6],
    [BIO_LIFESTYLE, 10],
  ]);
  const raw = pick(pool);
  return raw.length <= 12 ? raw : raw.slice(0, 10);
}

// ---------------------------------------------------------------------
// Avatars (public, stable URLs — Pravatar keeps them addressable)
// ---------------------------------------------------------------------
const AVATAR_POOL_UNSPLASH = [
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400",
  "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
  "https://images.unsplash.com/photo-1463453091185-61582044d556?w=400",
  "https://images.unsplash.com/photo-1499887142886-791eca5918cd?w=400",
  "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400",
  "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400",
  "https://images.unsplash.com/photo-1496440737103-cd596325d314?w=400",
];

export function generateAvatar(seed?: string): string {
  const roll = Math.random();
  if (roll < 0.75) return pick(AVATAR_POOL_UNSPLASH);
  if (roll < 0.9) {
    const id = 30 + Math.floor(Math.random() * 40);
    return `https://i.pravatar.cc/400?img=${id}${seed ? `&u=${encodeURIComponent(seed)}` : ""}`;
  }
  return pick(LOCAL_FALLBACK_AVATARS);
}

// ---------------------------------------------------------------------
// Age — weighted 19..40, most 20..30
// ---------------------------------------------------------------------
export function generateAge(): number {
  return weighted<number>([
    [19, 6], [20, 10], [21, 12], [22, 12], [23, 12], [24, 10],
    [25, 10], [26, 8], [27, 6], [28, 5], [29, 4], [30, 3],
    [31, 2], [32, 2], [33, 1.5], [34, 1.5], [35, 1], [36, 1],
    [37, 0.8], [38, 0.7], [39, 0.5], [40, 0.5],
  ]);
}

// ---------------------------------------------------------------------
// Distance (km) — max 40, weighted per spec
// 10% 15-19, 20% 20-24, 30% 25-30, 25% 31-35, 15% 36-40
// ---------------------------------------------------------------------
export function generateDistanceKm(): number {
  const bucket = weighted<[number, number]>([
    [[15, 19], 10],
    [[20, 24], 20],
    [[25, 30], 30],
    [[31, 35], 25],
    [[36, 40], 15],
  ]);
  const [lo, hi] = bucket;
  const value = lo + Math.random() * (hi - lo);
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------
// Public draft type + batch generator
// ---------------------------------------------------------------------
export interface SeedDraft {
  /** Local-only id used to key the draft card in the UI. */
  draft_id: string;
  display_name: string;
  username: string;
  avatar: string;
  bio: string;
  gender: "female" | "male" | "other";
  age: number;
  distance_km: number;
  province: string | null;
  is_online: boolean;
  is_active: boolean;
}

export interface GenerateOptions {
  /** Province auto-assigned to every draft (admin's operating region). */
  province?: string | null;
  /** Default status flag. */
  isActive?: boolean;
}

export function generateSeedBatch(count: number, opts: GenerateOptions = {}): SeedDraft[] {
  const safeCount = Math.max(1, Math.min(1000, Math.floor(count)));
  const takenUsernames = new Set<string>();
  const drafts: SeedDraft[] = [];
  for (let i = 0; i < safeCount; i++) {
    const display = generateDisplayName();
    drafts.push({
      draft_id: `draft_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      display_name: display,
      username: generateUsername(takenUsernames),
      avatar: generateAvatar(display),
      bio: generateBio(),
      gender: "female",
      age: generateAge(),
      distance_km: generateDistanceKm(),
      province: opts.province ?? null,
      is_online: Math.random() < 0.72,
      is_active: opts.isActive ?? true,
    });
  }
  return drafts;
}
