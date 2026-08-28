/**
 * DỌN RÁC DATABASE — xóa dữ liệu task/log của Bot cũ hơn 3 ngày.
 *
 * Cấu hình Scheduled Job gọi:
 *   POST /api/public/purge-logs-cron
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * Endpoint gọi RPC public.purge_old_logs() (SECURITY DEFINER).
 * SQL: docs/sql/RUN_NOW_2026-08-20_purge_old_logs_3days.sql
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { AUTOMATION_ENABLED } from "@/lib/automation-flags";

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function run(request: Request): Promise<Response> {
  // Automation tắt toàn cục: không chạm database, không chạy job nền.
  if (!AUTOMATION_ENABLED) {
    return Response.json({ ok: false, error: "automation disabled" }, { status: 503 });
  }
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!timingSafeEqual(provided, secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("purge_old_logs");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, deleted: data ?? 0 });
}

export const Route = createFileRoute("/api/public/purge-logs-cron")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});