/**
 * EMERGENCY PURGE API — SERVER-ONLY
 *
 * GET  /api/public/emergency-purge?secret=<CRON_SECRET>   → Phase A DRY-RUN (chỉ COUNT/LIST, KHÔNG mutation)
 * POST /api/public/emergency-purge?secret=<CRON_SECRET>   → Phase B EXECUTE (chỉ khi qua đủ cổng an toàn)
 *
 * Cổng an toàn của POST (thiếu bất kỳ điều kiện nào → HTTP 423, KHÔNG mutation):
 *   1. secret hợp lệ (CRON_SECRET / LOVABLE_CRON_SECRET, đọc từ process.env)
 *   2. EMERGENCY_PURGE_ARMED=true
 *   3. confirm === PURGE_CONFIRM_PHRASE
 *   4. executionId là token HMAC còn hiệu lực do dry-run phát hành (stateless,
 *      xác minh được ở bất kỳ serverless instance nào)
 *   5. Preflight chỉ-đọc: phạm vi / count / dependency khớp đúng dry-run đã ký
 *
 * - Không nhận service-role key từ request; key chỉ đọc từ process.env trên server.
 * - Không trả/không lưu key, token, cookie; không log secret.
 * - Không DROP/TRUNCATE/ALTER, không đổi schema/RLS/function/bucket.
 */
import { createFileRoute } from "@tanstack/react-router";
import { auditLog, checkExecuteGate, dryRun, execute } from "@/lib/purge/purge-engine.server";
import { PURGE_CONFIRM_PHRASE } from "@/lib/purge/purge-plan";

const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const REQUIREMENTS = {
  env: "EMERGENCY_PURGE_ARMED=true",
  confirm: PURGE_CONFIRM_PHRASE,
  executionId: "token có chữ ký lấy từ một lần dry-run (GET) còn hiệu lực 30 phút",
  scope: "phạm vi (purgeSettings) và count phải khớp đúng dry-run đó",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: NO_STORE });
}

function authorized(request: Request): boolean {
  const expected = process.env["CRON_SECRET"] ?? process.env["LOVABLE_CRON_SECRET"];
  if (!expected) return false;
  const provided =
    new URL(request.url).searchParams.get("secret") ?? request.headers.get("x-purge-secret") ?? "";
  return provided.length > 0 && provided === expected;
}

export const Route = createFileRoute("/api/public/emergency-purge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const report = await dryRun({
          purgeSettings: url.searchParams.get("purgeSettings") === "true",
        });
        auditLog({
          executionId: report.executionId ?? "unsigned",
          phase: "A_DRY_RUN",
          status: "ok",
        });
        return json(report);
      },

      POST: async ({ request }) => {
        // Thiếu/sai secret ở Phase B → KHOÁ (423), tuyệt đối không mutation.
        if (!authorized(request)) {
          auditLog({
            executionId: "unknown",
            phase: "B_EXECUTE_BLOCKED",
            status: "blocked",
            detail: "missing_secret",
          });
          return json(
            {
              phase: "B_EXECUTE",
              executed: false,
              mutations: "none",
              gate: "blocked",
              reason: "Thiếu hoặc sai secret — Phase B bị khoá.",
              requirements: REQUIREMENTS,
            },
            423,
          );
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }
        const executionId =
          typeof body["executionId"] === "string" ? (body["executionId"] as string) : undefined;
        const confirm =
          typeof body["confirm"] === "string" ? (body["confirm"] as string) : undefined;
        const purgeSettings = body["purgeSettings"] === true;

        const gate = await checkExecuteGate({ confirm, executionId, purgeSettings });
        if (!gate.allowed) {
          auditLog({
            executionId: executionId ?? "unknown",
            phase: "B_EXECUTE_BLOCKED",
            status: "blocked",
            detail: gate.reason,
          });
          return json(
            {
              phase: "B_EXECUTE",
              executed: false,
              mutations: "none",
              gate: "blocked",
              reason: gate.reason,
              requirements: REQUIREMENTS,
            },
            gate.httpStatus,
          );
        }

        // Cổng đã mở → engine vẫn tự preflight (chỉ đọc) trước mọi mutation.
        const result = await execute({
          confirm: confirm!,
          executionId: executionId!,
          purgeSettings,
        });
        if (result.locked) {
          return json(
            {
              phase: "B_EXECUTE",
              executed: false,
              mutations: "none",
              gate: "blocked",
              reason: result.reason,
              preflight: result.preflight ?? null,
              requirements: REQUIREMENTS,
            },
            423,
          );
        }
        return json(result, result["completed"] === true ? 200 : 500);
      },
    },
  },
});
