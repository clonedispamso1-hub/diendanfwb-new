/**
 * DATABASE ROUTER — CẤU HÌNH DUY NHẤT.
 *
 * Đây là FILE DUY NHẤT cần sửa khi muốn chuyển một bảng / một module sang
 * Supabase khác (Supabase 4, 5...). Không component nào được gọi
 * `createClient()` trực tiếp nữa — tất cả đi qua `Database.*`.
 *
 * Kiến trúc:
 *   - core    (Supabase 1): auth, profiles, ví/gem/xu/candy, VIP, thanh toán,
 *                           pet, dragon ball, admin & phân quyền, reports,
 *                           admin_logs, cấu hình website.
 *   - social  (Supabase 3): dữ liệu phát sinh khi người dùng dùng web —
 *                           notifications, views, activity/keyword logs,
 *                           engagement... (posts/comments/messages sẽ được
 *                           chuyển theo từng bước, xem MIGRATION_PLAN).
 *   - storage (Supabase 2 + Cloudinary): file upload (ảnh nén WebP, voice,
 *                           video) — GIF/Sticker/CDN đi Cloudinary.
 *
 * QUY TẮC BẢO MẬT (theo góp ý): reports, admin_logs, roles, permissions và mọi
 * bảng quản trị / tài chính LUÔN nằm ở core (Supabase 1).
 */

export type DbTarget = "core" | "social";

/**
 * Bảng → database. Bảng không có trong map mặc định về `DEFAULT_TARGET`.
 * Đổi 1 dòng ở đây là chuyển được cả module (đọc, ghi, realtime).
 */
export const TABLE_ROUTES: Record<string, DbTarget> = {
  // ---- SOCIAL (Supabase 3) — đã chuyển & đã kiểm chứng -------------------
  notifications: "social",
  activity_logs: "social",
  member_activity_log: "social",
  agent_activity_logs: "social",
  keyword_logs: "social",
  bot_actions_logs: "social",
  bot_activity_queue: "social",
  moderation_queue: "social",
  dice_logs: "social",
  post_views: "social",
  profile_views: "social",
  engagement_events: "social",
  engagement_points_log: "social",
  engagement_campaigns: "social",
  rate_limit_hits: "social",
  spam_detection_logs: "social",
  group_stats_log: "social",
  group_leave_log: "social",
  profile_views_today: "social",
  nearby_match_notifications: "social",
  connect_scan_usage: "social",

  // ---- SOCIAL (Supabase 3) — CUTOVER TOÀN BỘ PHẦN NẶNG ------------------
  // Nhật ký & bot (đọc + ghi 100% ở Supabase 3).
  admin_logs: "social",
  candy_logs: "social",
  system_health_logs: "social",
  security_events: "social",
  risk_scores: "social",

  // Feed: bài viết, bình luận, lượt thích.
  posts: "social",
  comments: "social",
  comment_likes: "social",
  likes: "social",
  post_likes: "social",

  // Mạng xã hội: theo dõi.
  follows: "social",

  // Messenger / Chat (kèm realtime).
  messages: "social",
  message_reactions: "social",
  message_gifts: "social",
  chat_partners: "social",
  conversation_clears: "social",
  group_messages: "social",
  chat_group_messages: "social",
  virtual_chat_messages: "social",

  // ---- CORE (Supabase 1) — BÀN THỜ HỆ THỐNG, không bao giờ migrate ------
  // Auth, profiles cốt lõi, danh sách chặn / security gate, ví & phân quyền.
  profiles: "core",
  user_roles: "core",
  bangchu: "core",
  bot_roles: "core",
  blocked_ips: "core",
  blocked_devices: "core",
  device_signals: "core",
  device_approvals: "core",
  phone_verifications: "core",
  profile_verifications: "core",
  reports: "core",
  user_reports: "core",
  user_restrictions: "core",
  wallets: "core",
  transactions: "core",
  withdrawals: "core",
  subscriptions: "core",
  referrals: "core",
  inventory: "core",
  pets: "core",
  seed_accounts: "core",
};

/** Bảng chưa khai báo → dùng database này. */
export const DEFAULT_TARGET: DbTarget = "core";

/** Tra cứu database cho một bảng. */
export function targetForTable(table: string): DbTarget {
  return TABLE_ROUTES[table] ?? DEFAULT_TARGET;
}

/** Danh sách bảng đang nằm ở social — dùng cho realtime registry. */
export const SOCIAL_TABLES: ReadonlySet<string> = new Set(
  Object.entries(TABLE_ROUTES)
    .filter(([, t]) => t === "social")
    .map(([name]) => name),
);
