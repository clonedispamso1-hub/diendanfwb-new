/**
 * ĐỒNG BỘ NỘI DUNG Supabase 1 -> Supabase 3 (một chiều, chỉ ĐỌC ở #1).
 *
 * Kiến trúc sau migration:
 *   - GHI (đăng bài, tim, bình luận, chat) vẫn vào Supabase 1 để giữ nguyên
 *     RLS + trigger + ~200 RPC (gem/quà/counters) đang chạy ở #1.
 *   - ĐỌC (feed, bình luận, tim, theo dõi, chat) lấy từ Supabase 3 -> egress
 *     của #1 gần như bằng 0.
 *   - Endpoint này giữ #3 luôn cập nhật: upsert theo id, không xoá gì.
 *
 * Gọi định kỳ (1–2 phút/lần):
 *   POST /api/public/sync-content-to-s3
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * Query tuỳ chọn: ?minutes=30 (mặc định 15) — cửa sổ thời gian đồng bộ.
 */
import { createFileRoute } from "@tanstack/react-router";

const S1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const S3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";

/** Bảng: khoá đối chiếu + cột thời gian dùng để lấy delta. */
const TABLES: { table: string; conflict: string; since: string }[] = [
  { table: "posts", conflict: "id", since: "created_at" },
  { table: "comments", conflict: "id", since: "created_at" },
  { table: "likes", conflict: "id", since: "created_at" },
  { table: "follows", conflict: "follower_id,following_id", since: "created_at" },
  { table: "messages", conflict: "id", since: "created_at" },
];

/** Cột có thật ở #3 — lọc để tránh lỗi PGRST204 khi #1 thêm cột mới. */
const S3_COLUMNS: Record<string, string[]> = {
  follows: ["follower_id", "following_id", "created_at"],
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const headers = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  ...extra,
});

function project(table: string, rows: Record<string, unknown>[]) {
  const cols = S3_COLUMNS[table];
  if (!cols) return rows;
  const set = new Set(cols);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => set.has(k))));
}

async function run(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  const k1 = process.env["SUPABASE1_SERVICE_ROLE_KEY"];
  const k3 = process.env["SUPABASE3_SERVICE_ROLE_KEY"];
  if (!secret || !k1 || !k3) {
    return Response.json({ ok: false, error: "missing server keys" }, { status: 503 });
  }
  // Cron của Vercel không cho đặt header tuỳ ý, nó gửi `Authorization: Bearer <CRON_SECRET>`.
  // Vì vậy chấp nhận cả `x-cron-secret` (cron ngoài / gọi tay) và Bearer token.
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-secret") ?? bearer;
  if (!timingSafeEqual(provided, secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }


  const url = new URL(request.url);
  const minutes = Math.min(Math.max(Number(url.searchParams.get("minutes") || 15), 1), 1440);
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const result: Record<string, number | string> = {};

  for (const { table, conflict, since: col } of TABLES) {
    try {
      let copied = 0;
      for (let off = 0; off < 5000; off += 500) {
        const readRes = await fetch(
          `${S1_URL}/rest/v1/${table}?select=*&${col}=gte.${since}&order=${col}.asc&offset=${off}&limit=500`,
          { headers: headers(k1) },
        );
        if (!readRes.ok) throw new Error(`read ${readRes.status} ${await readRes.text()}`);
        const rows = (await readRes.json()) as Record<string, unknown>[];
        if (!rows.length) break;
        const writeRes = await fetch(`${S3_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
          method: "POST",
          headers: headers(k3, { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(project(table, rows)),
        });
        if (!writeRes.ok) throw new Error(`write ${writeRes.status} ${await writeRes.text()}`);
        copied += rows.length;
        if (rows.length < 500) break;
      }

      // posts: counters (likes_count/comments_count/views_count) đổi qua UPDATE nên
      // không lọt vào delta theo created_at -> đồng bộ lại 50 bài mới nhất (chỉ cột ngắn).
      if (table === "posts") {
        const recent = await fetch(
          `${S1_URL}/rest/v1/posts?select=id,likes_count,comments_count,views_count,status,visibility,updated_at&order=created_at.desc&limit=50`,
          { headers: headers(k1) },
        );
        if (recent.ok) {
          const rows = (await recent.json()) as Record<string, unknown>[];
          if (rows.length) {
            await fetch(`${S3_URL}/rest/v1/posts?on_conflict=id`, {
              method: "POST",
              headers: headers(k3, { Prefer: "resolution=merge-duplicates,return=minimal" }),
              body: JSON.stringify(rows),
            });
          }
        }
      }

      result[table] = copied;
    } catch (err) {
      result[table] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return Response.json({ ok: true, since, result });
}

/**
 * ĐÃ TẮT sau cutover 100%: Feed/Chat/Follows nay GHI trực tiếp vào Supabase 3,
 * nên kéo dữ liệu từ #1 sang #3 sẽ làm sống lại bản ghi cũ/đã xoá.
 * Đặt CONTENT_SYNC_ENABLED=1 (env server) nếu cần bật lại tạm thời để đối chiếu.
 */
const syncEnabled = () => process.env["CONTENT_SYNC_ENABLED"] === "1";

const handler = ({ request }: { request: Request }) =>
  syncEnabled()
    ? run(request)
    : new Response(
        JSON.stringify({ ok: true, skipped: "disabled_after_full_cutover_to_supabase3" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

export const Route = createFileRoute("/api/public/sync-content-to-s3")({
  server: { handlers: { POST: handler, GET: handler } },
});
