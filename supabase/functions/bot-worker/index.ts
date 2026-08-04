// Bot Worker — moderation + risk detection executor
// Pulls jobs from bot_activity_queue, applies risk scoring + moderation actions,
// logs everything to bot_actions_logs. Safe to invoke from pg_cron via pg_net,
// or manually via HTTP.
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
const WORKER_ID = `worker-${crypto.randomUUID().slice(0,8)}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: require shared secret (pg_cron passes via header)
  if (WORKER_SECRET && req.headers.get("x-worker-secret") !== WORKER_SECRET) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = { claimed: 0, done: 0, failed: 0, risksRecomputed: 0, autoModerated: 0 };

  try {
    // 1) Auto moderation pass
    const { data: modCount } = await sb.rpc("bot_moderation_auto_apply", {
      p_hide_threshold: 40, p_escalate_threshold: 70, p_limit: 100,
    });
    summary.autoModerated = (modCount as number) ?? 0;

    // 2) Recompute risk for recently flagged users
    const { data: rCount } = await sb.rpc("bot_recompute_recent_risks", { p_minutes: 15 });
    summary.risksRecomputed = (rCount as number) ?? 0;

    // 3) Claim queue jobs
    const { data: jobs, error: claimErr } = await sb.rpc("bot_queue_claim", {
      p_worker: WORKER_ID, p_limit: 25, p_lock_seconds: 60,
    });
    if (claimErr) throw claimErr;
    summary.claimed = jobs?.length ?? 0;

    for (const job of (jobs ?? []) as Array<any>) {
      try {
        await processJob(sb, job);
        await sb.from("bot_activity_queue")
          .update({ status: "done", result: { worker: WORKER_ID, ts: new Date().toISOString() } })
          .eq("id", job.id);
        summary.done++;
      } catch (e) {
        await sb.from("bot_activity_queue")
          .update({ status: job.attempts >= job.max_attempts ? "failed" : "pending",
                    locked_until: null, locked_by: null,
                    last_error: String(e).slice(0, 500) })
          .eq("id", job.id);
        summary.failed++;
      }
    }

    // 4) Cleanup
    await sb.rpc("bot_queue_cleanup");
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), summary }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" }});
  }

  return new Response(JSON.stringify({ ok: true, worker: WORKER_ID, summary }),
    { headers: { ...corsHeaders, "content-type": "application/json" }});
});

async function processJob(sb: any, job: any) {
  const { job_type, payload, bot_id } = job;

  // Anti-loop guard
  if (payload?.target_user && bot_id) {
    const { data: canAct } = await sb.rpc("bot_can_act_on", {
      p_actor: bot_id, p_target_user: payload.target_user,
    });
    if (canAct === false) throw new Error("blocked: bot-to-bot");
  }

  // Duplicate guard
  if (bot_id && payload?.target_type && payload?.target_id) {
    const { data: dup } = await sb.rpc("bot_already_acted", {
      p_bot: bot_id, p_action: job_type,
      p_target_type: payload.target_type, p_target_id: String(payload.target_id),
    });
    if (dup === true) throw new Error("duplicate action skipped");
  }

  // Log the action — actual side-effects (likes/comments/etc.) are intentionally
  // delegated to per-type handlers added in later phases.
  await sb.from("bot_actions_logs").insert({
    bot_id, action: job_type,
    target_type: payload?.target_type ?? null,
    target_id:   payload?.target_id ? String(payload.target_id) : null,
    target_user: payload?.target_user ?? null,
    risk_score:  payload?.risk_score ?? null,
    result: "ok",
    meta: { worker: WORKER_ID, payload },
  });
}
