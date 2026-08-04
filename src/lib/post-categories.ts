/**
 * post-categories.ts
 *
 * Single source of truth for the "category system" powering Home + the
 * dedicated relationship pages (FWB now, ONS / Dating / Friends / Marriage
 * next).
 *
 * Adding a new category later = extend `POST_CATEGORIES` and
 * `RELATIONSHIP_TAGS_BY_CATEGORY` here, then mount a new page that reuses
 * the same feed + composer + sticker grid. No other code changes.
 */
export type PostCategoryId =
  | "GENERAL"
  | "FWB"
  | "ONS"
  | "DATING"
  | "FRIENDS"
  | "MARRIAGE";

export interface PostCategoryConfig {
  id: PostCategoryId;
  /** DB value stored in `public.posts.category`. Lowercase to match existing rows. */
  dbValue: string;
  emoji: string;
  label: string;
  navLabel: string;
  hint: string;
}

export const POST_CATEGORIES: Record<PostCategoryId, PostCategoryConfig> = {
  GENERAL: {
    id: "GENERAL",
    dbValue: "general",
    emoji: "🏠",
    label: "Trang chủ",
    navLabel: "Trang Chủ",
    hint: "Chia sẻ bất cứ điều gì bạn muốn.",
  },
  FWB: {
    id: "FWB",
    dbValue: "fwb",
    emoji: "💕",
    label: "Tìm FWB",
    navLabel: "💕 Tìm FWB",
    hint: "Chọn nhãn phù hợp, khu vực & viết một dòng giới thiệu.",
  },
  ONS: {
    id: "ONS",
    dbValue: "ons",
    emoji: "🔥",
    label: "Tìm ONS",
    navLabel: "🔥 Tìm ONS",
    hint: "Chỉ hôm nay — không ràng buộc.",
  },
  DATING: {
    id: "DATING",
    dbValue: "dating",
    emoji: "💘",
    label: "Tìm người yêu",
    navLabel: "💘 Người yêu",
    hint: "Tìm một nửa nghiêm túc.",
  },
  FRIENDS: {
    id: "FRIENDS",
    dbValue: "friends",
    emoji: "🫶",
    label: "Tìm bạn",
    navLabel: "🫶 Kết bạn",
    hint: "Kết bạn, tâm sự, đi chơi cùng.",
  },
  MARRIAGE: {
    id: "MARRIAGE",
    dbValue: "marriage",
    emoji: "💍",
    label: "Kết hôn",
    navLabel: "💍 Kết hôn",
    hint: "Tìm đối tượng nghiêm túc hướng tới hôn nhân.",
  },
};

export interface RelationshipTag {
  /** Snake-case id stored in `posts.relationship_type`. */
  id: string;
  /** Large sticker-style emoji. */
  emoji: string;
  /** Short label rendered under the sticker. */
  label: string;
  /** CSS gradient — used as the sticker card background. */
  gradient: string;
}

/**
 * Sticker-style tag pool. Big emoji + short label = LINE/Zalo sticker feel.
 * Each category has its own list. Adding categories later just plugs in.
 */
export const RELATIONSHIP_TAGS_BY_CATEGORY: Record<PostCategoryId, RelationshipTag[]> = {
  GENERAL: [],
  FWB: [
    { id: "FWB_FIND",     emoji: "❤️", label: "Tìm FWB",       gradient: "linear-gradient(135deg,#ffe0ec,#ff8fb1)" },
    { id: "FWB_HOT",      emoji: "💋", label: "FWB Dâm",       gradient: "linear-gradient(135deg,#ffb3c1,#ff5c8a)" },
    { id: "FWB_SECRET",   emoji: "🙈", label: "Kín Đáo",       gradient: "linear-gradient(135deg,#ffe4ec,#f4a6c0)" },
    { id: "FWB_LONG",     emoji: "💖", label: "Lâu Dài",       gradient: "linear-gradient(135deg,#ffd1dc,#e75480)" },
    { id: "FWB_NIGHT",    emoji: "🌙", label: "Ban Đêm",       gradient: "linear-gradient(135deg,#f2c6ff,#ff9dc7)" },
    { id: "FWB_CHILL",    emoji: "🤍", label: "Chill",         gradient: "linear-gradient(135deg,#ffffff,#ffd8e6)" },
    { id: "FWB_TALK",     emoji: "💬", label: "Tâm Sự",        gradient: "linear-gradient(135deg,#fde2e4,#f6a6b8)" },
    { id: "FWB_GENTLE",   emoji: "🌸", label: "Dịu Dàng",      gradient: "linear-gradient(135deg,#fff0f5,#ffb6c1)" },
    { id: "FWB_CASUAL",   emoji: "💞", label: "Không Ràng Buộc", gradient: "linear-gradient(135deg,#ffe0ec,#ff9ec2)" },
  ],
  ONS: [
    { id: "ONS_TONIGHT",  emoji: "🔥", label: "Tối Nay",  gradient: "linear-gradient(135deg,#ffd6e0,#ff5c8a)" },
    { id: "ONS_WEEKEND",  emoji: "🌆", label: "Cuối Tuần", gradient: "linear-gradient(135deg,#ffe4ec,#f4a6c0)" },
    { id: "ONS_TRAVEL",   emoji: "✈️", label: "Đi Chơi Xa", gradient: "linear-gradient(135deg,#fde2e4,#f6a6b8)" },
  ],
  DATING: [
    { id: "DATE_SERIOUS", emoji: "💍", label: "Nghiêm Túc", gradient: "linear-gradient(135deg,#ffe0ec,#ff9ec2)" },
    { id: "DATE_COFFEE",  emoji: "☕", label: "Cà Phê",     gradient: "linear-gradient(135deg,#fff0f5,#ffb6c1)" },
    { id: "DATE_MOVIE",   emoji: "🎬", label: "Xem Phim",   gradient: "linear-gradient(135deg,#ffd1dc,#e75480)" },
  ],
  FRIENDS: [],
  MARRIAGE: [],
};

export function getCategoryConfig(id: PostCategoryId): PostCategoryConfig {
  return POST_CATEGORIES[id];
}

export function getRelationshipTags(id: PostCategoryId): RelationshipTag[] {
  return RELATIONSHIP_TAGS_BY_CATEGORY[id] ?? [];
}

export function getRelationshipTag(
  category: PostCategoryId,
  tagId: string | null | undefined,
): RelationshipTag | null {
  if (!tagId) return null;
  return getRelationshipTags(category).find((t) => t.id === tagId) ?? null;
}

export function findRelationshipTagAnywhere(
  tagId: string | null | undefined,
): RelationshipTag | null {
  if (!tagId) return null;
  for (const list of Object.values(RELATIONSHIP_TAGS_BY_CATEGORY)) {
    const hit = list.find((t) => t.id === tagId);
    if (hit) return hit;
  }
  return null;
}
