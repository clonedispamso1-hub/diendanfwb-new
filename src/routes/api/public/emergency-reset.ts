/**
 * 🚨 KHẨN CẤP — XOÁ TOÀN BỘ DỮ LIỆU ỨNG DỤNG (DATA ONLY)
 *
 * NGUYÊN TẮC BẤT BIẾN
 *  - CHỈ dùng lệnh DELETE có kiểm soát trên danh sách bảng ĐƯỢC PHÉP (allowlist).
 *  - TUYỆT ĐỐI KHÔNG DROP TABLE / DROP SCHEMA / TRUNCATE / CASCADE phá cấu trúc.
 *  - Không đổi schema, không đổi RLS, không đổi cấu hình Auth / Supabase.
 *  - Chỉ chạy phía máy chủ. Service Role Key không bao giờ rời khỏi máy chủ.
 *  - Bắt buộc: phiên Bang Chủ/Admin hợp lệ + ngày sinh + checkbox + cụm từ
 *    "XOA DU LIEU". Thiếu bất kỳ điều kiện nào ⇒ huỷ, không xoá gì.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ CONFIG */

type DbId = "sb1" | "sb2" | "sb3" | "sb4";

const CONN: Record<DbId, { url: string; anon: string; envKey: string; label: string }> = {
  sb1: {
    url: "https://gxfxqbhxoghdhokwjpex.supabase.co",
    anon: "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx",
    envKey: "SUPABASE1_SERVICE_ROLE_KEY",
    label: "SB1 core (auth/profiles/ví/admin)",
  },
  sb2: {
    url: "https://pymwwuscoftmdcmmeckp.supabase.co",
    anon: "sb_publishable_G4i0YxIxTFRhNvtZpvxMjA_afSogbEU",
    envKey: "SUPABASE2_SERVICE_ROLE_KEY",
    label: "SB2 media/VIP/live",
  },
  sb3: {
    url: "https://uaqsetfdciyzxpuhulux.supabase.co",
    anon: "sb_publishable_64h3WhcmLuU3DL5oT5tlyg_lqdzB5Q1",
    envKey: "SUPABASE3_SERVICE_ROLE_KEY",
    label: "SB3 social/logs",
  },
  sb4: {
    url: "https://ybzdpxwbpbkeqkqwbscp.supabase.co",
    anon: "sb_publishable_1EMCL_1QFrg_A94S6yBYtw_M-tzirb8",
    envKey: "SUPABASE4_SERVICE_ROLE_KEY",
    label: "SB4 bait/zalo/albums",
  },
};

/** Ngày sinh xác minh (chỉ so sánh chữ số). */
const DOB_DIGITS = "792006";

/** Cụm từ xác nhận bắt buộc gõ chính xác. */
const CONFIRM_PHRASE = "XOA DU LIEU";

/**
 * ALLOWLIST — CHỈ những bảng dưới đây mới bị xoá dữ liệu, theo đúng thứ tự
 * (bảng con trước, bảng cha sau) để không vướng khoá ngoại.
 * Bảng KHÔNG có tên ở đây sẽ KHÔNG bao giờ bị đụng tới.
 */
const ALLOWLIST: Record<DbId, string[]> = {
  sb1: [
    "admin_popup_events",
    "crm_submissions",
    "crm_cards",
    "feedback_posts",
    "user_reports",
    "reports",
    "post_reports",
    "comment_reports",
    "user_locations",
    "daily_follow_stats",
    "gift_history",
    "gifts",
    // ⛔ TÀI CHÍNH — KHÔNG XOÁ (xem FINANCIAL_PRESERVED):
    //    gem_history, gem_transactions, coin_transfers, transfer_transactions,
    //    withdrawal_requests, transactions, subscriptions
    "inventory",
    "referrals",
    "phone_verifications",
    "profile_verifications",
    "user_restrictions",
    "device_signals",
    "device_approvals",
    "device_fingerprints",
    "login_attempts",
    "fake_profiles",
    "seed_accounts",
    "second_accounts",
    // profiles: xoá CÓ LOẠI TRỪ admin/Bang Chủ (xem PROFILE_TABLES)
    "profiles",
  ],

  sb2: [
    "live_moc_gifts",
    "live_moc_messages",
    "live_moc_viewers",
    "live_moc_sessions",
    "live_users",
    "vip_community_likes",
    "vip_community_comments",
    "vip_community_posts",
    "voice_messages",
    "clone_media",
    "feedback_attachments",
    "video_uploads",
    "uploads",
    "media_items",
    "media_library",
  ],
  sb3: [
    "comment_likes",
    "post_likes",
    "likes",
    "comments",
    "post_views",
    "post_media",
    "posts",
    "story_reactions",
    "story_views",
    "stories",
    "message_reactions",
    "messages",
    "group_messages",
    "conversation_clears",
    "conversations",
    "notifications",
    "red_packet_claims",
    "red_packets",
    "engagement_events",
    "profile_views",
    "follows",
    "user_blocks",
    "leaderboard_daily",
    "activity_logs",
  ],
  sb4: [
    "album_items",
    "albums",
    "seeding_follow_logs",
    "zalo_user_areas",
    "rps_challenges",
    "nearby_inventory",
    "nearby_pool",
  ],
};

/** Bảng TÀI CHÍNH — tuyệt đối không xoá (có thể là tiền thật của thành viên). */
const FINANCIAL_PRESERVED = [
  "withdrawal_requests",
  "transactions",
  "transfer_transactions",
  "coin_transfers",
  "gem_transactions",
  "gem_history",
  "subscriptions",
];

/**
 * KHÔNG BAO GIỜ ĐỤNG TỚI — cấu hình website, phân quyền, tài chính, bảo mật.
 * (Chỉ để hiển thị báo cáo; các bảng này vốn không nằm trong ALLOWLIST.)
 */
const PRESERVED: Record<DbId, string[]> = {
  sb1: [
    "bangchu", "user_roles", "bot_roles",
    "admin_site_settings", "admin_popups", "vip_icons", "gif_library",
    "banned_keywords", "blocked_ips", "blocked_devices", "security_events",
    ...FINANCIAL_PRESERVED,
  ],
  sb2: ["site_settings2", "live_moc_settings", "community_page", "voice_library"],
  sb3: ["admin_logs", "security_events", "spam_detection_logs", "moderation_queue"],
  sb4: [
    "site_branding", "bait_group_folders", "bait_groups", "zalo_country_cards",
    "zalo_sub_items_l1", "zalo_sub_items_l2", "zalo_float_icon",
    "zalo_media_library", "zalo_bait_groups", "zalo_area_groups", "reports",
  ],
};

/**
 * Bảng xoá CÓ LOẠI TRỪ: giữ lại dòng của admin/Bang Chủ.
 * table → cột chứa UID người dùng.
 */
const PROFILE_TABLES: Partial<Record<DbId, Record<string, string>>> = {
  sb1: { profiles: "id" },
};

/**
 * DANH SÁCH BUCKET ĐƯỢC PHÉP XOÁ FILE (chỉ nội dung do người dùng tạo).
 * Bucket KHÔNG có tên ở đây — kể cả bucket mới — luôn được GIỮ NGUYÊN FILE.
 */
const WIPEABLE_BUCKETS = [
  "media",
  "voice-messages",
  "clone_media",
  "album-covers",
  "live-media",
];

/**
 * Bucket hệ thống / cấu hình / thương hiệu — KHÔNG xoá bất kỳ file nào.
 * (Chỉ để báo cáo; mọi bucket ngoài WIPEABLE_BUCKETS đều được giữ.)
 */
const PRESERVED_BUCKETS = [
  "site-branding",
  "vip_icons",
  "titles",
  "zalo-media",
  "zalo-float-icon",
  "bait-groups",
  "payment-qr",
  "reports",
];


/* ------------------------------------------------------------------ HELPERS */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const digits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");

function readClient(db: DbId, bearer?: string): SupabaseClient<any> {
  return createClient<any>(CONN[db].url, CONN[db].anon, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}),
  });
}

/**
 * Khoá tạm thời do Admin nhập cho ĐÚNG một lần thực thi.
 * Không ghi vào database, không cookie, không localStorage, không log.
 */
export type KeyOverrides = Partial<Record<DbId, string>>;

function resolveKey(db: DbId, keys?: KeyOverrides): string | null {
  const env = process.env[CONN[db].envKey];
  if (env) return env;
  const manual = keys?.[db];
  return manual && manual.trim().length > 20 ? manual.trim() : null;
}

/** Client đặc quyền — CHỈ tồn tại trong phạm vi handler phía máy chủ. */
function serviceClient(db: DbId, keys?: KeyOverrides): SupabaseClient<any> | null {
  const key = resolveKey(db, keys);
  if (!key) return null;
  return createClient<any>(CONN[db].url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function countAll(c: SupabaseClient<any>, table: string): Promise<number | null> {
  const { count, error } = await c.from(table).select("*", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}

/**
 * Xoá TOÀN BỘ dòng của một bảng bằng DELETE có điều kiện luôn đúng.
 * Không TRUNCATE, không DROP — cấu trúc bảng giữ nguyên 100%.
 */
async function deleteAllRows(
  c: SupabaseClient<any>,
  table: string,
): Promise<{ table: string; before: number | null; after: number | null; ok: boolean; note: string }> {
  const before = await countAll(c, table);
  if (before === null)
    return { table, before: null, after: null, ok: false, note: "Bảng không tồn tại / không đọc được → bỏ qua" };
  if (before === 0) return { table, before: 0, after: 0, ok: true, note: "Đã trống" };

  const cols = ["id", "user_id", "created_at", "uuid"];
  let lastErr = "";
  for (const col of cols) {
    const { error } = await c.from(table).delete().or(`${col}.is.null,${col}.not.is.null`);
    if (!error) {
      const after = await countAll(c, table);
      return { table, before, after, ok: true, note: `Đã xoá bằng DELETE (khoá lọc: ${col})` };
    }
    lastErr = error.message;
  }
  return { table, before, after: before, ok: false, note: `Không xoá được: ${lastErr}` };
}

/**
 * Xoá dòng NHƯNG GIỮ LẠI các UID được bảo vệ (admin/Bang Chủ).
 * Dùng cho `profiles` — tài khoản quản trị không bao giờ bị xoá.
 */
async function deleteRowsExcept(
  c: SupabaseClient<any>,
  table: string,
  uidCol: string,
  keepIds: string[],
): Promise<{ table: string; before: number | null; after: number | null; ok: boolean; note: string }> {
  const before = await countAll(c, table);
  if (before === null)
    return { table, before: null, after: null, ok: false, note: "Bảng không tồn tại / không đọc được → bỏ qua" };
  if (before === 0) return { table, before: 0, after: 0, ok: true, note: "Đã trống" };
  if (!keepIds.length)
    return {
      table,
      before,
      after: before,
      ok: false,
      note: "Huỷ xoá: không xác định được danh sách admin cần bảo toàn",
    };

  const list = `(${keepIds.join(",")})`;
  const { error } = await c.from(table).delete().not(uidCol, "in", list);
  if (error) return { table, before, after: before, ok: false, note: `Không xoá được: ${error.message}` };
  const after = await countAll(c, table);
  return {
    table,
    before,
    after,
    ok: true,
    note: `Đã xoá, GIỮ LẠI ${keepIds.length} tài khoản quản trị (Bang Chủ/Admin/role)`,
  };
}


/* --------------------------------------------------- ADMIN (xác thực phiên) */

async function requireAdmin(request: Request): Promise<{ ok: boolean; uid?: string; token?: string }> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false };
  const sb1 = readClient("sb1");
  const { data, error } = await sb1.auth.getUser(token);
  const uid = data?.user?.id;
  if (error || !uid) return { ok: false };

  const scoped = readClient("sb1", token);
  const bc = await scoped.from("bangchu").select("status,is_active").eq("auth_user_id", uid).maybeSingle();
  if (bc.data && (bc.data as any).status === "approved" && (bc.data as any).is_active)
    return { ok: true, uid, token };
  const pf = await scoped.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
  if ((pf.data as any)?.is_admin === true) return { ok: true, uid, token };
  return { ok: false };
}

/* ------------------------------------------------------------------ DRY RUN */

async function buildPreview(keys?: KeyOverrides) {
  const databases: Array<{
    id: string;
    label: string;
    hasKey: boolean;
    rows: Array<{ table: string; total: number | null }>;
    preserved: string[];
    total: number;
  }> = [];

  for (const db of ["sb1", "sb2", "sb3", "sb4"] as const) {
    const c = serviceClient(db, keys);
    const rows: Array<{ table: string; total: number | null }> = [];
    let total = 0;
    if (c) {
      for (const t of ALLOWLIST[db]) {
        const n = await countAll(c, t);
        if (n !== null) total += n;
        rows.push({ table: t, total: n });
      }
    }
    databases.push({
      id: db.toUpperCase(),
      label: CONN[db].label,
      hasKey: !!c,
      rows,
      preserved: PRESERVED[db],
      total,
    });
  }

  const missingKeys = (["sb1", "sb2", "sb3", "sb4"] as const)
    .filter((d) => !serviceClient(d, keys))
    .map((d) => CONN[d].envKey);

  const { ids: adminIds, sources: adminSources } = await collectAdminIds(keys);

  return {
    mode: "PREVIEW" as const,
    executed: false,
    missingKeys,
    databases,
    adminPreserved: adminIds.length,
    adminSources,
    financialPreserved: FINANCIAL_PRESERVED,
    preservedBuckets: PRESERVED_BUCKETS,
    wipeableBuckets: WIPEABLE_BUCKETS,
    auditLogTable: "admin_logs (SB3) — được ghi khi thực thi, không bị xoá",
    grandTotal: databases.reduce((a, d) => a + d.total, 0),
  };
}

/* ------------------------------------------------------------------ EXECUTE */

/**
 * Nguồn nhận diện quản trị THỰC TẾ của hệ thống phân quyền hiện có:
 *  - `bangchu.auth_user_id` (Bang Chủ)
 *  - `user_roles.user_id` (mọi vai trò quản trị/điều hành đã cấp)
 *  - `profiles.is_admin = true`
 *  - `profiles.role` chứa admin/mod/bangchu (nếu cột tồn tại)
 * Không thay đổi vai trò hay RLS — chỉ ĐỌC để bảo toàn.
 */
async function collectAdminIds(keys?: KeyOverrides): Promise<{ ids: string[]; sources: Record<string, number> }> {
  const c = serviceClient("sb1", keys);
  if (!c) return { ids: [], sources: {} };
  const ids = new Set<string>();
  const sources: Record<string, number> = {};

  const bc = await c.from("bangchu").select("auth_user_id");
  sources["bangchu"] = (bc.data || []).length;
  (bc.data || []).forEach((r: any) => r?.auth_user_id && ids.add(String(r.auth_user_id)));

  const ur = await c.from("user_roles").select("user_id");
  sources["user_roles"] = (ur.data || []).length;
  (ur.data || []).forEach((r: any) => r?.user_id && ids.add(String(r.user_id)));

  const adm = await c.from("profiles").select("id").eq("is_admin", true);
  sources["profiles.is_admin"] = (adm.data || []).length;
  (adm.data || []).forEach((r: any) => r?.id && ids.add(String(r.id)));

  const byRole = await c.from("profiles").select("id,role").in("role", ["admin", "moderator", "mod", "bangchu", "owner"]);
  if (!byRole.error) {
    sources["profiles.role"] = (byRole.data || []).length;
    (byRole.data || []).forEach((r: any) => r?.id && ids.add(String(r.id)));
  }

  return { ids: Array.from(ids), sources };
}


async function wipeStorage(db: DbId, keys?: KeyOverrides): Promise<{ bucket: string; removed: number; note: string }[]> {
  const c = serviceClient(db, keys);
  if (!c) return [];
  const out: { bucket: string; removed: number; note: string }[] = [];
  const { data: buckets, error } = await c.storage.listBuckets();
  if (error || !buckets) return out;

  for (const b of buckets) {
    if (!WIPEABLE_BUCKETS.includes(b.name)) {
      out.push({
        bucket: b.name,
        removed: 0,
        note: PRESERVED_BUCKETS.includes(b.name)
          ? "Bucket hệ thống/thương hiệu → GIỮ NGUYÊN toàn bộ file"
          : "Không nằm trong danh sách được phép xoá → GIỮ NGUYÊN toàn bộ file",
      });
      continue;
    }

    let removed = 0;
    const walk = async (prefix: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      const { data: items } = await c.storage.from(b.name).list(prefix, { limit: 1000 });
      if (!items?.length) return;
      const files = items.filter((i: any) => i.id).map((i: any) => (prefix ? `${prefix}/${i.name}` : i.name));
      const folders = items.filter((i: any) => !i.id).map((i: any) => (prefix ? `${prefix}/${i.name}` : i.name));
      for (let i = 0; i < files.length; i += 100) {
        const chunk = files.slice(i, i + 100);
        const { error: rmErr } = await c.storage.from(b.name).remove(chunk);
        if (!rmErr) removed += chunk.length;
      }
      for (const f of folders) await walk(f, depth + 1);
    };
    await walk("", 0);
    out.push({ bucket: b.name, removed, note: "Đã xoá file, bucket giữ nguyên" });
  }
  return out;
}

async function deleteMemberAuthUsers(adminIds: string[], keys?: KeyOverrides): Promise<{ deleted: number; kept: number; errors: number }> {
  const c = serviceClient("sb1", keys);
  if (!c) return { deleted: 0, kept: 0, errors: 0 };
  let deleted = 0;
  let kept = 0;
  let errors = 0;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await c.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (adminIds.includes(u.id)) {
        kept++;
        continue;
      }
      const { error: delErr } = await c.auth.admin.deleteUser(u.id);
      if (delErr) errors++;
      else deleted++;
    }
    if (data.users.length < 200) break;
  }
  return { deleted, kept, errors };
}

/**
 * Ghi nhật ký vào hệ thống `admin_logs` hiện có (SB3 — bảng này KHÔNG nằm trong
 * ALLOWLIST nên không bao giờ bị wipe xoá). Thử lần lượt các dạng cột đang tồn
 * tại trong dự án; không tạo/đổi bảng, không đổi cấu trúc.
 */
async function writeAuditLog(actorId: string | undefined, report: any, keys?: KeyOverrides): Promise<{ logged: boolean; note: string }> {
  const c = serviceClient("sb3", keys);
  if (!c) return { logged: false, note: "Không có khoá SB3 → không ghi được nhật ký" };

  const detail = {
    event: "EMERGENCY_DATA_WIPE",
    initiated_by: actorId ?? null,
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    confirmation: "PASSED (ngày sinh + cảnh báo + cụm từ + xác nhận cuối)",
    affected_databases: report.databases.map((d: any) => ({ id: d.id, skipped: !!d.skipped, rows_deleted: d.deleted || 0 })),
    rows_deleted: report.totalRowsDeleted,
    files_deleted: report.totalFilesDeleted,
    auth_users_deleted: report.auth?.deleted ?? 0,
    auth_users_preserved: report.auth?.kept ?? 0,
    admin_accounts_preserved: report.adminPreserved ?? 0,
    tables_changed: 0,
    structures_changed: 0,
    schema_changes: 0,
    dropped_tables: 0,
    truncates: 0,
  };
  const action = `EMERGENCY_DATA_WIPE — rows=${detail.rows_deleted}, files=${detail.files_deleted}, auth_deleted=${detail.auth_users_deleted}, tables_changed=0, structures_changed=0`;

  const shapes: Record<string, unknown>[] = [
    { admin_id: actorId ?? null, action, target_type: "system", detail },
    { admin_id: actorId ?? null, action, detail },
    { actor_id: actorId ?? null, action, metadata: detail },
    { actor_id: actorId ?? null, action },
    { action },
  ];
  let lastErr = "";
  for (const row of shapes) {
    const { error } = await c.from("admin_logs").insert(row as any);
    if (!error) return { logged: true, note: "Đã ghi vào admin_logs (SB3)" };
    lastErr = error.message;
  }
  return { logged: false, note: `Không ghi được nhật ký: ${lastErr}` };
}

async function runWipe(actorId?: string, keys?: KeyOverrides) {
  const startedAt = new Date().toISOString();
  const { ids: adminIds, sources: adminSources } = await collectAdminIds(keys);
  const databases: any[] = [];
  const storage: any[] = [];

  /** Không xác định được admin ⇒ huỷ, không xoá gì (tránh mất tài khoản quản trị). */
  if (!adminIds.length) {
    return {
      mode: "ABORTED" as const,
      executed: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: "ADMIN_SET_EMPTY",
      message: "Không xác định được tài khoản Bang Chủ/Admin cần bảo toàn. Đã huỷ, không xoá gì.",
    };
  }

  for (const db of ["sb1", "sb2", "sb3", "sb4"] as const) {
    const c = serviceClient(db, keys);
    if (!c) {
      databases.push({ id: db.toUpperCase(), label: CONN[db].label, skipped: true, rows: [], deleted: 0 });
      continue;
    }
    storage.push({ id: db.toUpperCase(), buckets: await wipeStorage(db, keys) });

    const rows: any[] = [];
    let deleted = 0;
    for (const t of ALLOWLIST[db]) {
      const uidCol = PROFILE_TABLES[db]?.[t];
      const r = uidCol ? await deleteRowsExcept(c, t, uidCol, adminIds) : await deleteAllRows(c, t);
      if (r.ok && r.before) deleted += r.before - (r.after ?? 0);
      rows.push(r);
    }
    databases.push({
      id: db.toUpperCase(),
      label: CONN[db].label,
      skipped: false,
      rows,
      deleted,
      preserved: PRESERVED[db],
    });
  }

  const auth = await deleteMemberAuthUsers(adminIds, keys);

  const report: any = {
    mode: "EXECUTED" as const,
    executed: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    schemaChanges: 0,
    droppedTables: 0,
    truncates: 0,
    databases,
    storage,
    auth,
    adminPreserved: adminIds.length,
    adminSources,
    financialPreserved: FINANCIAL_PRESERVED,
    preservedBuckets: PRESERVED_BUCKETS,
    wipeableBuckets: WIPEABLE_BUCKETS,
    totalRowsDeleted: databases.reduce((a: number, d: any) => a + (d.deleted || 0), 0),
    totalFilesDeleted: storage.reduce(
      (a: number, s: any) => a + (s.buckets || []).reduce((x: number, b: any) => x + (b.removed || 0), 0),
      0,
    ),
  };

  report.auditLog = await writeAuditLog(actorId, report, keys);
  return report;
}


/* ------------------------------------------------------------------ ROUTE */

export const Route = createFileRoute("/api/public/emergency-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }

        const admin = await requireAdmin(request);
        if (!admin.ok) return json({ ok: false, error: "FORBIDDEN" }, 403);

        const action = body?.action;

        /**
         * Khoá tạm do Admin nhập — chỉ tồn tại trong phạm vi request này.
         * Không ghi database, không cookie, không log, không trả ngược về client.
         */
        const rawKeys = (body?.keys ?? {}) as Record<string, unknown>;
        const keys: KeyOverrides = {};
        for (const d of ["sb1", "sb2", "sb3", "sb4"] as const) {
          const v = rawKeys[d];
          if (typeof v === "string" && v.trim().length > 20) keys[d] = v.trim();
        }

        /** Trạng thái khoá: bảng nào còn thiếu để giao diện mở ô nhập tương ứng. */
        if (action === "key-status") {
          const missingNow = (["sb1", "sb2", "sb3", "sb4"] as const)
            .filter((d) => !serviceClient(d, keys))
            .map((d) => ({ db: d, envKey: CONN[d].envKey, label: CONN[d].label }));
          return json({ ok: true, missing: missingNow });
        }

        if (action === "preview" || action === "dry-run") {
          return json({ ok: true, report: await buildPreview(keys) });
        }

        if (action !== "execute") return json({ ok: false, error: "BAD_ACTION" }, 400);

        /* ---------- Kiểm tra 3 lớp xác nhận. Sai bất kỳ ⇒ huỷ, không xoá ---------- */
        if (digits(body?.dob) !== DOB_DIGITS)
          return json({ ok: false, error: "DOB_MISMATCH", message: "Ngày sinh xác minh không đúng. Đã huỷ, không xoá gì." }, 400);
        if (body?.acknowledged !== true)
          return json({ ok: false, error: "NOT_ACKNOWLEDGED", message: "Chưa tích ô cảnh báo. Đã huỷ, không xoá gì." }, 400);
        if (String(body?.phrase ?? "") !== CONFIRM_PHRASE)
          return json({ ok: false, error: "PHRASE_MISMATCH", message: `Phải gõ chính xác "${CONFIRM_PHRASE}". Đã huỷ, không xoá gì.` }, 400);
        if (body?.finalConfirm !== true)
          return json({ ok: false, error: "NO_FINAL_CONFIRM", message: "Thiếu xác nhận cuối cùng. Đã huỷ, không xoá gì." }, 400);

        const missingList = (["sb1", "sb2", "sb3", "sb4"] as const)
          .filter((d) => !serviceClient(d, keys))
          .map((d) => ({ db: d, envKey: CONN[d].envKey, label: CONN[d].label }));
        if (missingList.length)
          return json(
            {
              ok: false,
              error: "MISSING_SERVICE_KEYS",
              missing: missingList,
              message: `Thiếu khoá máy chủ: ${missingList.map((m) => m.envKey).join(", ")}. Đã huỷ, không xoá gì.`,
            },
            503,
          );

        const report = await runWipe(admin.uid, keys);
        return json({ ok: true, report });
      },
    },
  },
});
