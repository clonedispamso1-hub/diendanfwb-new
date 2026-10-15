/**
 * From Reply — được Supabase 4 (pg_cron + pg_net) gọi CHỈ khi có lượt đến hạn.
 * Header: x-cron-secret: <FROM_REPLY_CRON_SECRET>
 */
import { createFileRoute } from "@tanstack/react-router";

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function run(request: Request): Promise<Response> {
  const secret = (process.env["FROM_REPLY_CRON_SECRET"] || "").trim();
  if (!secret) return Response.json({ ok: false, error: "not configured" }, { status: 503 });
  const got = request.headers.get("x-cron-secret") ?? "";
  if (!safeEq(got, secret)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const S = await import("@/lib/from-reply.server");
  const missing = S.missingKeys();
  if (missing.length) return Response.json({ ok: false, error: "missing keys" }, { status: 503 });
  try {
    return Response.json({ ok: true, ...(await S.runDueReplies()) });
  } catch (e) {
    console.error("[from-reply-cron]", (e as Error).message);
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/from-reply-cron")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
