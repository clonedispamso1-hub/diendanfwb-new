/**
 * AUTO APPROVE — endpoint chạy nền thay cho pg_cron.
 *
 * Cấu hình Scheduler (Vercel Cron / Edge Function Scheduler / bất kỳ cron ngoài)
 * gọi mỗi phút:
 *   POST /api/public/auto-approve-cron
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * Endpoint gọi RPC public.auto_approve_pending_signups() (SECURITY DEFINER).
 * RPC tự kiểm tra cấu hình auto_approve + auto_approve_minutes trong app_settings,
 * nên gọi lặp lại là an toàn (idempotent).
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
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(provided, secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("auto_approve_pending_signups");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, approved: data ?? 0 });
}

export const Route = createFileRoute("/api/public/auto-approve-cron")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
