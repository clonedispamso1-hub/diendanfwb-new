import { createFileRoute } from "@tanstack/react-router";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Xoá 1 object trên Cloudflare R2.
 *
 * Dùng khi xoá video: xoá bản ghi metadata ở Supabase #2 (video_posts) và
 * xoá luôn file gốc trên R2 — file video KHÔNG bao giờ nằm trên Supabase Storage.
 *
 * Yêu cầu: Authorization: Bearer <supabase access token>.
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ENV_KEYS = [
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_DOMAIN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

const KEY_RE = /^[a-zA-Z0-9._/-]{1,180}$/;

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

/** Lấy object key từ URL public R2 (hoặc chính key nếu client gửi key). */
function resolveKey(input: string, publicDomain: string, bucket: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let key = raw;
  if (/^https?:\/\//i.test(raw)) {
    let path: string;
    try {
      path = new URL(raw).pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
    // Endpoint dạng <account>.r2.cloudflarestorage.com/<bucket>/<key>
    if (bucket && path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
    key = decodeURIComponent(path);
    // Chỉ cho xoá file thuộc domain public của bucket (hoặc endpoint R2).
    const host = new URL(raw).host.toLowerCase();
    const allowed =
      (publicDomain && host === new URL(publicDomain).host.toLowerCase()) ||
      /\.r2\.dev$/.test(host) ||
      /\.r2\.cloudflarestorage\.com$/.test(host);
    if (!allowed) return null;
  }
  return KEY_RE.test(key) ? key : null;
}

export const Route = createFileRoute("/api/public/r2-delete")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),

      GET: () => {
        const missing = ENV_KEYS.filter((k) => !process.env[k]);
        return Response.json(
          { ok: missing.length === 0, missing },
          { status: 200, headers: { ...cors, "cache-control": "no-store" } },
        );
      },

      POST: async ({ request }) => {
        const endpoint = process.env["R2_ENDPOINT"];
        const bucket = process.env["R2_BUCKET_NAME"] || "";
        const publicDomain = (process.env["R2_PUBLIC_DOMAIN"] || "").replace(/\/+$/, "");
        const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
        const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

        const missing = ENV_KEYS.filter((k) => !process.env[k]);
        if (missing.length) {
          return Response.json(
            {
              error: "Cloudflare R2 chưa được cấu hình.",
              detail: `Thiếu biến môi trường: ${missing.join(", ")}`,
              missing,
            },
            { status: 503, headers: cors },
          );
        }

        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        let body: { url?: string; key?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* ignore */
        }

        const key = resolveKey(body.key || body.url || "", publicDomain, bucket);
        if (!key) {
          return Response.json({ error: "Invalid url/key" }, { status: 400, headers: cors });
        }

        const client = new S3Client({
          region: "auto",
          endpoint,
          credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        });

        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch (e) {
          return Response.json(
            { error: "Xoá file trên R2 thất bại.", detail: (e as Error).message },
            { status: 502, headers: cors },
          );
        }

        return Response.json(
          { ok: true, key },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },
    },
  },
});
