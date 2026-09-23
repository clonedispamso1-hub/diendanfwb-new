import { createFileRoute } from "@tanstack/react-router";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

/**
 * TEST-ONLY endpoint: kiểm tra cấu hình Cloudflare R2 do admin nhập tạm thời.
 *
 * - Yêu cầu đăng nhập (Bearer <supabase access token>).
 * - 5 giá trị cấu hình chỉ tồn tại trong RAM của request này — KHÔNG lưu
 *   vào env, database, file, hay bất kỳ nơi nào khác.
 * - Test bằng ListObjectsV2 (MaxKeys=1) để xác nhận credentials hợp lệ.
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bearer(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function getUserId(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  try {
    const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user?.id ?? null;
  } catch {
    return null;
  }
}

const FIELD_RE = /^[\x20-\x7e]{1,512}$/;

export const Route = createFileRoute("/api/public/r2-test")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),

      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        let body: Record<string, string> = {};
        try {
          body = (await request.json()) as Record<string, string>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
        }

        const endpoint = String(body.endpoint || "").trim();
        const bucket = String(body.bucket || "").trim();
        const publicDomain = String(body.publicDomain || "").trim().replace(/\/+$/, "");
        const accessKeyId = String(body.accessKeyId || "").trim();
        const secretAccessKey = String(body.secretAccessKey || "").trim();

        const fields = { endpoint, bucket, publicDomain, accessKeyId, secretAccessKey };
        const missing = Object.entries(fields)
          .filter(([, v]) => !v)
          .map(([k]) => k);
        if (missing.length) {
          return Response.json(
            { error: `Thiếu: ${missing.join(", ")}` },
            { status: 400, headers: cors },
          );
        }
        for (const v of Object.values(fields)) {
          if (!FIELD_RE.test(v)) {
            return Response.json(
              { error: "Giá trị chứa ký tự không hợp lệ." },
              { status: 400, headers: cors },
            );
          }
        }
        if (!/^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(endpoint)) {
          return Response.json(
            { error: "R2_ENDPOINT phải dạng https://<account-id>.r2.cloudflarestorage.com" },
            { status: 400, headers: cors },
          );
        }
        if (!/^https:\/\//i.test(publicDomain)) {
          return Response.json(
            { error: "R2_PUBLIC_DOMAIN phải bắt đầu bằng https://" },
            { status: 400, headers: cors },
          );
        }

        const client = new S3Client({
          region: "auto",
          endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });

        try {
          const out = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
          );
          return Response.json(
            {
              ok: true,
              bucket,
              sampleCount: out.Contents?.length ?? 0,
              message: "Kết nối R2 thành công. Credentials hợp lệ (chỉ kiểm tra, không lưu).",
            },
            { headers: { ...cors, "cache-control": "no-store" } },
          );
        } catch (e) {
          const err = e as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
          return Response.json(
            {
              ok: false,
              error: "Kết nối R2 thất bại.",
              detail: `${err.name || "Error"}: ${err.message}`,
              status: err.$metadata?.httpStatusCode,
            },
            { status: 502, headers: cors },
          );
        }
      },
    },
  },
});
