/**
 * Member Badge system — 100% vector (SVG), không dùng emoji Unicode.
 *
 * Rules (product-locked):
 *   • Admin chính         → Crown 3D vàng (glow + shine).
 *   • Clone VIP (nick ảo) → Tick xanh VIP ZALO.
 *   • User thường         → 1 badge random, chốt cứng lúc đăng ký,
 *                           lưu ở `profiles.badge_id`, KHÔNG random lại.
 *
 * Chỉ giữ các badge "đẹp" (linh thú / chiến binh). Không dùng icon
 * trừu tượng kiểu vòng tròn, ngôi sao mờ, placeholder.
 *
 * DB chỉ lưu `badge_id`. Frontend map id → glyph vector + màu glow riêng.
 */
import type { BadgeGlyphKey } from "@/components/candy/badge-glyphs";

export interface BadgeDef {
  id: string;
  icon: BadgeGlyphKey;
  label: string;
  /** RGB triple dùng cho glow / LED của badge. */
  rgb: string;
}

export const MEMBER_BADGES: BadgeDef[] = [
  // Mythic
  { id: "dragon", icon: "dragon", label: "Thanh Long", rgb: "56 189 248" },
  { id: "dragon_fire", icon: "dragon", label: "Hỏa Long", rgb: "239 68 68" },
  { id: "phoenix", icon: "phoenix", label: "Phượng Hoàng", rgb: "251 146 60" },
  { id: "unicorn", icon: "unicorn", label: "Kỳ Lân", rgb: "244 114 182" },
  { id: "angel", icon: "angel", label: "Thiên Thần", rgb: "253 230 138" },
  { id: "demon", icon: "demon", label: "Ác Quỷ", rgb: "168 85 247" },
  { id: "skull", icon: "skull", label: "Tử Thần", rgb: "203 213 225" },
  { id: "alien", icon: "alien", label: "Dị Nhân", rgb: "132 204 22" },
  { id: "ghost", icon: "ghost", label: "U Linh", rgb: "148 163 184" },

  // Beasts
  { id: "fox", icon: "fox", label: "Cáo Lửa", rgb: "249 115 22" },
  { id: "kitsune", icon: "kitsune", label: "Hồ Ly", rgb: "236 72 153" },
  { id: "wolf", icon: "wolf", label: "Sói Xám", rgb: "148 163 184" },
  { id: "wolf_night", icon: "wolf", label: "Sói Đêm", rgb: "129 140 248" },
  { id: "lion", icon: "lion", label: "Sư Tử", rgb: "250 204 21" },
  { id: "tiger", icon: "tiger", label: "Mãnh Hổ", rgb: "251 146 60" },
  { id: "panther", icon: "panther", label: "Báo Đen", rgb: "139 92 246" },
  { id: "cat", icon: "cat", label: "Miêu Thần", rgb: "56 189 248" },
  { id: "bear", icon: "bear", label: "Hùng Bá", rgb: "180 83 9" },
  { id: "deer", icon: "deer", label: "Thần Lộc", rgb: "217 119 6" },

  // Birds
  { id: "eagle", icon: "eagle", label: "Đại Bàng", rgb: "250 204 21" },
  { id: "owl", icon: "owl", label: "Cú Đêm", rgb: "168 85 247" },
  { id: "swan", icon: "swan", label: "Thiên Nga", rgb: "125 211 252" },

  // Bugs
  { id: "butterfly", icon: "butterfly", label: "Hồ Điệp", rgb: "192 132 252" },
  { id: "bee", icon: "bee", label: "Ong Chúa", rgb: "250 204 21" },
  { id: "scorpion", icon: "scorpion", label: "Bọ Cạp", rgb: "239 68 68" },

  // Sea
  { id: "shark", icon: "shark", label: "Cá Mập", rgb: "56 189 248" },
  { id: "octopus", icon: "octopus", label: "Bạch Tuộc", rgb: "236 72 153" },
  { id: "crab", icon: "crab", label: "Cua Chiến", rgb: "248 113 113" },

  // Tech / warriors
  { id: "robot", icon: "robot", label: "Người Máy", rgb: "59 130 246" },
  { id: "ninja", icon: "ninja", label: "Ninja", rgb: "100 116 139" },
  { id: "samurai", icon: "samurai", label: "Samurai", rgb: "244 63 94" },
  { id: "flame", icon: "flame", label: "Hỏa Diệm", rgb: "249 115 22" },
  { id: "thunder", icon: "thunder", label: "Lôi Thần", rgb: "234 179 8" },
];

const BADGE_MAP = new Map(MEMBER_BADGES.map((b) => [b.id, b]));

/** Các badge_id cũ (bộ emoji / bộ icon xấu) → badge vector tương ứng. */
const LEGACY_ALIAS: Record<string, string> = {
  // bộ icon trừu tượng đã bị loại bỏ
  star: "thunder", sparkle: "thunder", circle: "dragon",

  dragon_face: "dragon_fire", devil: "demon", imp: "demon", ogre: "demon",
  leopard: "panther", black_cat: "panther", cat_pet: "cat",

  woozy: "ghost", angry: "demon", rage: "flame", sneeze: "ghost",
  teary: "swan", pleading: "unicorn", shh: "ninja", giggle: "cat",
  peek: "cat", gasp: "ghost",
  cat_grin: "cat", cat_joy: "cat", cat_love: "cat", cat_smirk: "panther",
  cat_kiss: "cat", cat_scream: "cat", cat_cry: "panther",
  peacock: "phoenix", dove: "swan", parrot: "eagle", penguin: "swan",
  chick: "bee", baby_chick: "bee", hatching: "bee",
  bison: "bear", rhino: "bear", hippo: "bear", horse: "deer",
  dog: "wolf", guide_dog: "wolf", service_dog: "wolf",
  monkey: "bear", orangutan: "bear", gorilla: "bear",
  ladybug: "scorpion", snail: "crab",
  lobster: "crab", squid: "octopus", shrimp: "crab",
  fish: "shark", blowfish: "shark",
};

export const DEFAULT_BADGE_ID = "dragon";

export function getBadge(id: string | null | undefined): BadgeDef | null {
  if (!id) return null;
  return BADGE_MAP.get(id) ?? BADGE_MAP.get(LEGACY_ALIAS[id] ?? "") ?? null;
}

/** Random 1 badge — chỉ gọi đúng 1 lần lúc tạo tài khoản. */
export function randomBadgeId(): string {
  const i = Math.floor(Math.random() * MEMBER_BADGES.length);
  return MEMBER_BADGES[i]?.id ?? DEFAULT_BADGE_ID;
}

/**
 * KHÔNG hash, KHÔNG random khi hiển thị: tài khoản chưa có `badge_id`
 * trong database luôn dùng badge mặc định, giống nhau ở mọi màn hình.
 */
export function badgeIdForUser(_userId?: string | null): string {
  return DEFAULT_BADGE_ID;
}

/** Badge cuối cùng hiển thị cho 1 user thường. */
export function resolveMemberBadge(
  userId: string | null | undefined,
  badgeId: string | null | undefined,
): BadgeDef {
  return getBadge(badgeId) ?? getBadge(DEFAULT_BADGE_ID) ?? MEMBER_BADGES[0];
}
