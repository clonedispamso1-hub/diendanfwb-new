/**
 * ⚙️ FILE CẤU HÌNH DUY NHẤT CỦA DATABASE ROUTER.
 *
 * Muốn chuyển một module sang Supabase khác (ví dụ Feed: #1 → #3, hoặc #2 → #5)
 * thì CHỈ sửa file này — không đụng vào bất kỳ component / service nào khác.
 *
 * 1. Thêm instance mới vào SUPABASE_INSTANCES.
 * 2. Đổi giá trị trong MODULE_DB cho module cần chuyển.
 */

export type InstanceId = "primary" | "media" | "logs";

export interface InstanceConfig {
  id: InstanceId;
  label: string;
  url: string;
  anonKey: string;
  /** true = client giữ session đăng nhập (chỉ instance auth chính). */
  persistSession: boolean;
  /** storageKey riêng khi cần tách session (ví dụ phiên admin). */
  storageKey?: string;
}

const env = import.meta.env as Record<string, string | undefined>;

const pick = (value: string | undefined, fallback: string) =>
  (value && value.trim() ? value.trim() : fallback).replace(/\/+$/, "");

/**
 * Supabase #1 — LÕI HỆ THỐNG (auth, profiles, ví gem, bảo mật, admin, clone).
 * Ưu tiên biến mới VITE_SUPABASE_URL_1 / VITE_SUPABASE_ANON_KEY_1
 * (project mới reset Egress — khởi tạo bằng supabase/sql/INIT_CLEAN_SB1.sql).
 * Nếu chưa set, fallback về biến cũ để không vỡ môi trường hiện tại.
 */
const PRIMARY: InstanceConfig = {
  id: "primary",
  label: "Supabase #1 (core)",
  url: pick(env["VITE_SUPABASE_URL_1"], "https://gxfxqbhxoghdhokwjpex.supabase.co"),
  anonKey:
    env["VITE_SUPABASE_ANON_KEY_1"] ||
    "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx",
  persistSession: true,
};

/** Supabase #2 — Live Móc 🦋 + Cộng Đồng VIP + media. */
const MEDIA: InstanceConfig = {
  id: "media",
  label: "Supabase #2 (media/VIP)",
  url: pick(env["VITE_MEDIA_SUPABASE_URL"], "https://pymwwuscoftmdcmmeckp.supabase.co"),
  anonKey:
    env["VITE_MEDIA_SUPABASE_ANON_KEY"] || "sb_publishable_G4i0YxIxTFRhNvtZpvxMjA_afSogbEU",
  persistSession: false,
};

/** Supabase #3 — logs, thống kê, notifications, post_views... */
const LOGS: InstanceConfig = {
  id: "logs",
  label: "Supabase #3 (logs/stats)",
  url: pick(env["VITE_LOGS_SUPABASE_URL"], "https://uaqsetfdciyzxpuhulux.supabase.co"),
  anonKey: env["VITE_LOGS_SUPABASE_ANON_KEY"] || "sb_publishable_64h3WhcmLuU3DL5oT5tlyg_lqdzB5Q1",
  persistSession: false,
};

export const SUPABASE_INSTANCES: Record<InstanceId, InstanceConfig> = {
  primary: PRIMARY,
  media: MEDIA,
  logs: LOGS,
};

/**
 * Danh sách module nghiệp vụ của app. Mỗi module trỏ tới đúng 1 instance.
 * Giai đoạn 1 (chuyển Feed sang Supabase #3) = đổi `feed: "logs"` ở đây.
 */
export type ModuleName =
  | "auth"
  | "profiles"
  | "feed"
  | "comments"
  | "follows"
  | "chat"
  | "notifications"
  | "activity"
  | "stats"
  | "media"
  | "vip"
  | "admin"
  | "automation"
  | "misc";

export const MODULE_DB: Record<ModuleName, InstanceId> = {
  auth: "primary",
  profiles: "primary",
  // Posts/comments đã cutover sang Supabase #3 (MIGRATE_POSTS_TO_SB3).
  feed: "logs",
  comments: "logs",
  follows: "primary",
  // Chat/Messenger đã cutover sang Supabase #3 (xem supabase/sql/MIGRATE_CHAT_TO_SB3.sql).
  chat: "logs",
  notifications: "logs",
  activity: "logs",
  stats: "logs",
  media: "media",
  vip: "media",
  admin: "primary",
  automation: "primary",
  misc: "primary",
};

/** Instance dùng cho phiên đăng nhập của Bang Chủ (session tách riêng). */
export const ADMIN_SESSION_STORAGE_KEY = "candy.admin.auth";
