/**
 * 🔍 AUDIT CHỈ-ĐỌC — Supabase #1..#4
 *
 * CHỈ làm 3 việc: COUNT bảng (HTTP GET + Prefer: count=exact),
 * đếm auth users (Admin API GET), liệt kê object trong bucket (GET/LIST).
 *
 * TUYỆT ĐỐI KHÔNG: INSERT / UPDATE / DELETE / TRUNCATE / DROP / ALTER / migration.
 * Service-role key CHỈ đọc từ process.env trên server, không log, không trả về client.
 *
 * Gọi: GET /api/public/audit-readonly?secret=<CRON_SECRET>
 */
import { createFileRoute } from "@tanstack/react-router";

type Inst = { id: "SB1" | "SB2" | "SB3" | "SB4"; url: string; envKey: string; anon: string };

const INSTANCES: Inst[] = [
  {
    id: "SB1",
    url: "https://gxfxqbhxoghdhokwjpex.supabase.co",
    envKey: "SUPABASE1_SERVICE_ROLE_KEY",
    anon: "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx",
  },
  {
    id: "SB2",
    url: "https://pymwwuscoftmdcmmeckp.supabase.co",
    envKey: "SUPABASE2_SERVICE_ROLE_KEY",
    anon: "sb_publishable_G4i0YxIxTFRhNvtZpvxMjA_afSogbEU",
  },
  {
    id: "SB3",
    url: "https://uaqsetfdciyzxpuhulux.supabase.co",
    envKey: "SUPABASE3_SERVICE_ROLE_KEY",
    anon: "sb_publishable_64h3WhcmLuU3DL5oT5tlyg_lqdzB5Q1",
  },
  {
    id: "SB4",
    url: "https://ybzdpxwbpbkeqkqwbscp.supabase.co",
    envKey: "SUPABASE4_SERVICE_ROLE_KEY",
    anon: "sb_publishable_1EMCL_1QFrg_A94S6yBYtw_M-tzirb8",
  },
];

const TABLES: Record<Inst["id"], string[]> = {
  SB1: [
    "profiles", "user_roles", "bangchu", "admin_permissions", "admin_role_assignments",
    "admin_config", "admin_site_settings", "admin_popups", "admin_gift_batch_log",
    "internal_account_credentials", "gem_transactions", "coin_transactions",
    "transfer_transactions", "transfer_audit_log", "withdrawal_requests",
    "withdrawal_audit_log", "post_gifts", "seed_accounts", "fake_profiles", "fake_follows",
    "blocked_ips", "blocked_devices", "blocked_keywords", "blocked_phones", "blocked_cookies",
    "phone_blacklist", "phone_verifications", "profile_verifications", "user_blocks",
    "user_restrictions", "forced_logouts", "device_accounts", "device_approval_settings",
    "bot_accounts", "bot_roles", "bot_assignments", "bot_settings", "crm_customers",
    "crm_expenses", "vip_icons", "vip_icon_folders", "gif_library", "feedback_posts",
    "nicktuongtac", "red_packets", "stories", "videos_social", "fwb_profiles",
  ],
  SB2: [
    "user_zalo", "site_settings2", "voice_library", "community_page",
    "live_moc_rooms", "live_moc_settings", "video_posts", "call_sessions2",
  ],
  SB3: [
    "posts", "comments", "likes", "comment_likes", "follows", "messages", "conversations",
    "conversation_clears", "chat_partners", "message_gifts", "message_reactions",
    "group_messages", "chat_group_messages", "virtual_chat_messages", "notifications",
    "post_views", "activity_logs", "member_activity_log", "admin_logs", "audit_logs",
    "security_events", "moderation_queue", "moderation_admins", "admin_comment_jobs",
    "admin_job_locks", "candy_logs", "keyword_logs", "spam_detection_logs",
    "system_health_logs", "bot_actions_logs", "agent_activity_logs", "risk_scores",
    "rate_limit_hits", "weekly_scores", "leaderboard_weights", "leaderboard_refresh_state",
  ],
  SB4: [
    "reports", "albums", "bait_groups", "bait_group_folders", "seed_account_groups",
    "seeding_follow_logs", "map_coordinates", "nearby_settings", "nearby_pool",
    "site_branding", "zalo_area_groups", "zalo_bait_groups", "zalo_country_cards",
    "zalo_float_icon", "zalo_media_library", "zalo_sub_items_l1", "zalo_sub_items_l2",
    "zalo_user_areas",
  ],
};

const BUCKETS: Record<Inst["id"], string[]> = {
  SB1: ["verification-photos", "media", "vip_icons", "titles", "avatars", "gifs"],
  SB2: ["media", "voice-messages", "clone_media", "feedback-media"],
  SB3: ["feedback", "media"],
  SB4: ["album-covers", "site-branding", "zalo-media", "zalo-float-icon", "bait-groups"],
};

/** COUNT thuần: GET + Prefer count=exact, limit 0 → không tải dữ liệu. */
async function countTable(url: string, key: string, table: string) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    method: "GET",
    headers: { apikey: key, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range") ?? "";
  if (!res.ok) return { table, count: null as number | null, status: res.status };
  const n = Number(cr.split("/")[1]);
  return { table, count: Number.isFinite(n) ? n : null, status: res.status };
}

/** Đếm auth.users qua Admin API (GET, phân trang). */
async function countAuthUsers(url: string, key: string) {
  let page = 1;
  let total = 0;
  const perPage = 1000;
  for (;;) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { total: null as number | null, status: res.status, users: [] as any[] };
    const body = (await res.json()) as { users?: any[] };
    const users = body.users ?? [];
    total += users.length;
    if (users.length < perPage) {
      return { total, status: 200, users };
    }
    page += 1;
    if (page > 50) return { total, status: 200, users: [] };
  }
}

/** Đếm object trong bucket (LIST đệ quy, không tải file, không xoá). */
async function countBucket(url: string, key: string, bucket: string, prefix = "", depth = 0) {
  let files = 0;
  if (depth > 6) return files;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!res.ok) return files;
    const items = (await res.json()) as Array<{ name: string; id: string | null }>;
    if (!items.length) return files;
    for (const it of items) {
      if (it.id) files += 1;
      else files += await countBucket(url, key, bucket, prefix ? `${prefix}/${it.name}` : it.name, depth + 1);
    }
    if (items.length < 1000) return files;
    offset += 1000;
  }
}

export const Route = createFileRoute("/api/public/audit-readonly")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env["CRON_SECRET"] ?? process.env["LOVABLE_CRON_SECRET"];
        const given = new URL(request.url).searchParams.get("secret");
        if (!expected || given !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const report: Record<string, unknown> = { mode: "READ-ONLY", mutations: "none" };

        for (const inst of INSTANCES) {
          const service = process.env[inst.envKey];
          const key = service || inst.anon;
          const keySource = service ? "service_role" : "anon (RLS-limited)";

          const tables = await Promise.all(
            TABLES[inst.id].map((t) => countTable(inst.url, key, t)),
          );
          const buckets: Record<string, number> = {};
          for (const b of BUCKETS[inst.id]) {
            buckets[b] = await countBucket(inst.url, key, b);
          }

          const entry: Record<string, unknown> = { keySource, tables, buckets };

          if (inst.id === "SB1" && service) {
            const auth = await countAuthUsers(inst.url, service);
            entry["authUsersTotal"] = auth.total;
            entry["authUsersConfirmed"] = auth.users.filter((u) => u.email_confirmed_at || u.phone_confirmed_at).length || null;
            entry["authAdminEmails"] = auth.users
              .map((u) => String(u.email ?? ""))
              .filter((e) => /admin|bangchu/i.test(e));
          } else if (inst.id === "SB1") {
            entry["authUsersTotal"] = "UNAVAILABLE — thiếu SUPABASE1_SERVICE_ROLE_KEY";
          }

          report[inst.id] = entry;
        }

        return Response.json(report, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
