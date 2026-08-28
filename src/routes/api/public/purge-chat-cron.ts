/**
 * MESSAGE SYSTEM V2 — endpoint chạy job dọn dữ liệu chat quá 72 giờ.
 *
 * Thay cho pg_cron: cấu hình một Scheduled Job gọi:
 *   POST /api/public/purge-chat-cron
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * Endpoint gọi RPC public.purge_expired_chat_data() (SECURITY DEFINER).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { AUTOMATION_ENABLED } from "@/lib/automation-flags";

// Chat (public.messages) nằm trên Supabase #3 sau cutover — job reset 72h
// phải gọi RPC trên đúng instance này.
const SUPABASE_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_64h3WhcmLuU3DL5oT5tlyg_lqdzB5Q1";

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

  const { data, error } = await supabase.rpc("purge_expired_chat_data");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, deleted: data ?? 0 });
}

export const Route = createFileRoute("/api/public/purge-chat-cron")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
