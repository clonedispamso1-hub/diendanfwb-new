/**
 * EMERGENCY PURGE — KẾ HOẠCH (khai báo thuần, KHÔNG thực thi gì)
 *
 * Nguồn: docs/AUDIT-PRE-PURGE-DEPENDENCY-2026-09-23.md
 * File này CHỈ chứa dữ liệu cấu hình: danh sách project, thứ tự bảng theo FK thật,
 * bảng cấu hình cần giữ, bucket cần giữ. Không import client, không gọi network.
 */

export type InstanceId = "SB1" | "SB2" | "SB3" | "SB4";

export type PurgeInstance = {
  id: InstanceId;
  url: string;
  /** Tên biến môi trường chứa service-role key (chỉ đọc trên server). */
  serviceKeyEnv: string;
  hasAuth: boolean;
};

export const PURGE_INSTANCES: PurgeInstance[] = [
  {
    id: "SB1",
    url: "https://gxfxqbhxoghdhokwjpex.supabase.co",
    serviceKeyEnv: "SUPABASE1_SERVICE_ROLE_KEY",
    hasAuth: true,
  },
  {
    id: "SB2",
    url: "https://pymwwuscoftmdcmmeckp.supabase.co",
    serviceKeyEnv: "SUPABASE2_SERVICE_ROLE_KEY",
    hasAuth: false,
  },
  {
    id: "SB3",
    url: "https://uaqsetfdciyzxpuhulux.supabase.co",
    serviceKeyEnv: "SUPABASE3_SERVICE_ROLE_KEY",
    hasAuth: false,
  },
  {
    id: "SB4",
    url: "https://ybzdpxwbpbkeqkqwbscp.supabase.co",
    serviceKeyEnv: "SUPABASE4_SERVICE_ROLE_KEY",
    hasAuth: false,
  },
];

/**
 * Khoá ngoại THẬT (đọc từ schema PostgREST). child.column -> parent.table
 * Dùng để kiểm chứng thứ tự purge tại runtime, không hard-code tin tưởng tuyệt đối.
 */
export const REAL_FOREIGN_KEYS: Record<InstanceId, Array<{ child: string; parent: string }>> = {
  SB1: [
    { child: "bot_assignments", parent: "profiles" },
    { child: "device_accounts", parent: "profiles" },
    { child: "internal_account_credentials", parent: "profiles" },
    { child: "phone_verifications", parent: "profiles" },
    { child: "profile_verifications", parent: "profiles" },
    { child: "red_packets", parent: "profiles" },
    { child: "seed_accounts", parent: "profiles" },
    { child: "transfer_transactions", parent: "profiles" },
    { child: "user_restrictions", parent: "profiles" },
    { child: "withdrawal_requests", parent: "profiles" },
  ],
  SB2: [],
  SB3: [{ child: "engagement_events", parent: "engagement_campaigns" }],
  SB4: [
    { child: "bait_groups", parent: "bait_group_folders" },
    { child: "zalo_area_groups", parent: "zalo_sub_items_l1" },
    { child: "zalo_user_areas", parent: "zalo_sub_items_l1" },
    { child: "zalo_sub_items_l2", parent: "zalo_sub_items_l1" },
  ],
};

/** View — KHÔNG được DELETE. */
export const VIEWS: Record<InstanceId, string[]> = {
  SB1: ["v_seed_accounts"],
  SB2: [],
  SB3: [],
  SB4: ["nearby_pool_public"],
};

/**
 * Bảng CẤU HÌNH HỆ THỐNG — mặc định GIỮ NGUYÊN record (không phải dữ liệu user).
 * Có thể chuyển sang purge nếu người dùng xác nhận (option `purgeSettings`).
 */
export const KEEP_SETTINGS_TABLES: Record<InstanceId, string[]> = {
  SB1: [
    "admin_site_settings",
    "device_approval_settings",
    "vip_icons",
    "vip_icon_folders",
    "gif_library",
    "banned_keywords",
  ],
  SB2: ["site_settings2", "live_moc_settings"],
  SB3: ["leaderboard_weights"],
  SB4: ["site_branding", "zalo_float_icon"],
};

/**
 * THỨ TỰ PURGE theo audit. Con trước cha; Admin và Auth ở CUỐI.
 * Mỗi mảng là "stage" — trong cùng stage không có FK lẫn nhau.
 */
export const PURGE_ORDER: Record<InstanceId, string[][]> = {
  SB3: [
    [
      "post_views",
      "member_activity_log",
      "activity_logs",
      "likes",
      "comment_likes",
      "message_reactions",
      "message_gifts",
      "profile_views",
      "profile_views_today",
      "rate_limit_hits",
      "risk_scores",
      "security_events",
      "spam_detection_logs",
      "system_health_logs",
      "keyword_logs",
      "candy_logs",
      "dice_logs",
      "bot_actions_logs",
      "bot_activity_queue",
      "agent_activity_logs",
      "audit_logs",
      "admin_logs",
      "group_leave_log",
      "group_stats_log",
      "engagement_points_log",
      "engagement_points_transfers",
    ],
    [
      "comments",
      "chat_partners",
      "conversation_clears",
      "messages",
      "group_messages",
      "chat_group_messages",
      "virtual_chat_messages",
      "notifications",
      "follows",
      "weekly_scores",
      "leaderboard_refresh_state",
      "conversations",
      "moderation_queue",
      "admin_comment_jobs",
      "admin_job_locks",
      "user_restrictions",
    ],
    ["posts"],
    ["engagement_events"],
    ["engagement_campaigns"],
    // ADMIN của SB3 — cuối cùng
    ["moderation_admins"],
  ],
  SB4: [
    [
      "seeding_follow_logs",
      "reports",
      "map_coordinates",
      "nearby_pool",
      "nearby_settings",
      "albums",
      "seed_account_groups",
      "zalo_media_library",
      "zalo_country_cards",
    ],
    ["bait_groups", "zalo_area_groups", "zalo_user_areas", "zalo_sub_items_l2"],
    ["bait_group_folders", "zalo_sub_items_l1", "group_folders", "zalo_bait_groups"],
  ],
  SB2: [
    [
      "user_zalo",
      "voice_library",
      "live_moc_rooms",
      "call_sessions2",
      "video_posts",
      "community_page",
    ],
  ],
  SB1: [
    // stage 1 — giao dịch & log tài chính
    [
      "post_gifts",
      "gem_transactions",
      "coin_transactions",
      "transfer_transactions",
      "red_packets",
      "withdrawal_requests",
      "withdrawal_audit_log",
      "admin_gift_batch_log",
    ],
    // stage 2 — bảng con của profiles + dữ liệu user
    [
      "phone_verifications",
      "profile_verifications",
      "device_accounts",
      "internal_account_credentials",
      "seed_accounts",
      "bot_assignments",
      "user_restrictions",
      "user_blocks",
      "forced_logouts",
      "stories",
      "videos_social",
      "feedback_posts",
      "nicktuongtac",
      "group_members",
      "popup_dismissals",
      "fake_profiles",
      "fake_follows",
      "fwb_profiles",
      "crm_customers",
      "crm_expenses",
      "blocked_ips",
      "blocked_devices",
      "blocked_keywords",
      "blocked_phones",
      "blocked_cookies",
      "phone_blacklist",
    ],
    // stage 3 — profiles (bao gồm profiles.is_admin)
    ["profiles"],
    // stage 4 — ADMIN / QUYỀN (CUỐI CÙNG, trước Auth)
    [
      "admin_permissions",
      "admin_role_assignments",
      "user_roles",
      "admin_config",
      "bot_roles",
      "bot_accounts",
      "bot_settings",
      "admin_popups",
      "bangchu",
    ],
  ],
};

/** Thứ tự chạy giữa các project (Storage trước, Auth sau cùng — do engine điều phối). */
export const INSTANCE_ORDER: InstanceId[] = ["SB3", "SB4", "SB2", "SB1"];

/**
 * 9 cơ chế cấp quyền Admin/Bang Chủ đã phát hiện trong audit.
 * Purge phải xử lý HẾT, và chỉ ở giai đoạn cuối.
 */
export const ADMIN_SURFACES: Array<{
  instance: InstanceId;
  table: string;
  note: string;
  mode: "delete_all" | "delete_flagged_rows" | "auth_api";
}> = [
  { instance: "SB1", table: "bangchu", note: "Danh tính Bang Chủ (2 bản ghi)", mode: "delete_all" },
  {
    instance: "SB1",
    table: "profiles",
    note: "profiles.is_admin = true (2 tài khoản KHÁC bangchu)",
    mode: "delete_flagged_rows",
  },
  { instance: "SB1", table: "user_roles", note: "Bảng role (đang rỗng)", mode: "delete_all" },
  {
    instance: "SB1",
    table: "admin_role_assignments",
    note: "Gán role admin (rỗng)",
    mode: "delete_all",
  },
  {
    instance: "SB1",
    table: "admin_permissions",
    note: "Quyền chi tiết (rỗng)",
    mode: "delete_all",
  },
  { instance: "SB1", table: "admin_config", note: "Cấu hình admin (rỗng)", mode: "delete_all" },
  { instance: "SB1", table: "bot_roles", note: "Quyền bot", mode: "delete_all" },
  {
    instance: "SB1",
    table: "bot_accounts",
    note: "Tài khoản bot (kèm bot_assignments)",
    mode: "delete_all",
  },
  { instance: "SB3", table: "moderation_admins", note: "Admin kiểm duyệt", mode: "delete_all" },
  {
    instance: "SB1",
    table: "auth.users",
    note: "Xóa toàn bộ user, gồm bangchu_01/02@admin.candy.local",
    mode: "auth_api",
  },
];

/** Bucket theo audit. keep = KHÔNG xóa object (logo/icon giao diện). */
export const STORAGE_PLAN: Array<{
  instance: InstanceId;
  bucket: string;
  auditedObjects: number;
  purpose: string;
  keep: boolean;
}> = [
  {
    instance: "SB2",
    bucket: "media",
    auditedObjects: 983,
    purpose: "Ảnh/video bài viết, avatar",
    keep: false,
  },
  {
    instance: "SB2",
    bucket: "feedback-media",
    auditedObjects: 1,
    purpose: "Ảnh góp ý",
    keep: false,
  },
  {
    instance: "SB2",
    bucket: "live-thumbnails",
    auditedObjects: 1,
    purpose: "Thumbnail live",
    keep: false,
  },
  {
    instance: "SB2",
    bucket: "call-media",
    auditedObjects: 0,
    purpose: "Media cuộc gọi",
    keep: false,
  },
  {
    instance: "SB2",
    bucket: "meida",
    auditedObjects: 0,
    purpose: "Bucket sai tên, rỗng",
    keep: false,
  },
  { instance: "SB3", bucket: "feedback", auditedObjects: 3, purpose: "Ảnh feedback", keep: false },
  {
    instance: "SB3",
    bucket: "payment-qr",
    auditedObjects: 0,
    purpose: "QR thanh toán",
    keep: false,
  },
  {
    instance: "SB4",
    bucket: "report-proofs",
    auditedObjects: 4,
    purpose: "Bằng chứng tố cáo",
    keep: false,
  },
  {
    instance: "SB4",
    bucket: "album-covers",
    auditedObjects: 4,
    purpose: "Ảnh bìa album",
    keep: false,
  },
  {
    instance: "SB4",
    bucket: "zalo-media",
    auditedObjects: 2,
    purpose: "Ảnh mục Zalo",
    keep: false,
  },
  {
    instance: "SB4",
    bucket: "taixiu-assets",
    auditedObjects: 20,
    purpose: "Asset game Tài Xỉu",
    keep: false,
  },
  {
    instance: "SB4",
    bucket: "bait-groups",
    auditedObjects: 0,
    purpose: "Ảnh nhóm mồi",
    keep: false,
  },
  { instance: "SB4", bucket: "live-media", auditedObjects: 0, purpose: "Media live", keep: false },
  // GIỮ LẠI theo yêu cầu
  {
    instance: "SB4",
    bucket: "site-branding",
    auditedObjects: 3,
    purpose: "Logo/branding site",
    keep: true,
  },
  {
    instance: "SB4",
    bucket: "zalo-float-icon",
    auditedObjects: 2,
    purpose: "Icon nổi giao diện",
    keep: true,
  },
];

export const PURGE_CONFIRM_PHRASE = "EMERGENCY PURGE CONFIRM";

/**
 * BẢNG CẤU HÌNH GIAO DIỆN — GIỮ NGUYÊN TUYỆT ĐỐI.
 * Khác với KEEP_SETTINGS_TABLES: danh sách này KHÔNG bị ảnh hưởng bởi
 * option `purgeSettings`. Các bảng này tham chiếu asset giao diện cần giữ lại
 * (logo/branding, icon Zalo nổi) nên không bao giờ được xóa record.
 */
export const ALWAYS_KEEP_TABLES: Record<InstanceId, string[]> = {
  SB1: [],
  SB2: [],
  SB3: [],
  SB4: ["site_branding", "zalo_float_icon"],
};
