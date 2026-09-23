import { createFileRoute } from "@tanstack/react-router";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Ký (sign) upload Cloudflare R2 ở phía server.
 *
 * Client KHÔNG BAO GIỜ thấy Access Key / Secret — chỉ nhận 1 URL PUT
 * dùng một lần (presigned, hết hạn 5 phút) cho đúng folder/tên file.
 *
 * Yêu cầu: người gọi phải đăng nhập (Authorization: Bearer <supabase token>).
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FOLDER_RE = /^[a-z0-9][a-z0-9._/-]{0,60}$/i;
const KEY_RE = /^[a-zA-Z0-9._/-]{1,180}$/;
const OVERRIDE_OK = (v?: string) =>
  typeof v === "string" && /^[\x20-\x7e]{1,512}$/.test(v.trim()) && v.trim().length > 0;

const ENV_KEYS = [
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_DOMAIN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

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

export const Route = createFileRoute("/api/public/r2-sign")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),

      // Health check: xem endpoint còn sống & biến môi trường nào đang thiếu.
      GET: () => {
        const missing = ENV_KEYS.filter((k) => !process.env[k]);
        return Response.json(
          { ok: missing.length === 0, missing },
          { status: 200, headers: { ...cors, "cache-control": "no-store" } },
        );
      },

      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        let body: {
          folder?: string;
          filename?: string;
          contentType?: string;
          override?: Record<string, string>;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* body rỗng cũng được */
        }

        // Cấu hình tạm (phiên test) do client gửi kèm — chỉ tồn tại trong
        // RAM của request này, không ghi vào env/DB/file.
        const ov = body.override;
        const useOverride =
          !!ov &&
          OVERRIDE_OK(ov.endpoint) &&
          OVERRIDE_OK(ov.bucket) &&
          OVERRIDE_OK(ov.publicDomain) &&
          OVERRIDE_OK(ov.accessKeyId) &&
          OVERRIDE_OK(ov.secretAccessKey) &&
          /^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/i.test(ov.endpoint.trim()) &&
          /^https:\/\//i.test(ov.publicDomain.trim());

        const endpoint = useOverride ? ov!.endpoint.trim() : process.env["R2_ENDPOINT"];
        const bucket = useOverride ? ov!.bucket.trim() : process.env["R2_BUCKET_NAME"];
        const publicDomain = (
          useOverride ? ov!.publicDomain.trim() : process.env["R2_PUBLIC_DOMAIN"] || ""
        ).replace(/\/+$/, "");
        const accessKeyId = useOverride ? ov!.accessKeyId.trim() : process.env["R2_ACCESS_KEY_ID"];
        const secretAccessKey = useOverride
          ? ov!.secretAccessKey.trim()
          : process.env["R2_SECRET_ACCESS_KEY"];

        if (!useOverride) {
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
        }


        const folder = String(body.folder || "candy").replace(/^\/+|\/+$/g, "");
        if (!FOLDER_RE.test(folder)) {
          return Response.json({ error: "Invalid folder" }, { status: 400, headers: cors });
        }

        const rawName = String(body.filename || "file")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(-80) || "file";
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const key = `${folder}/${stamp}-${rawName}`;
        if (!KEY_RE.test(key)) {
          return Response.json({ error: "Invalid key" }, { status: 400, headers: cors });
        }

        const contentType = String(body.contentType || "application/octet-stream").slice(0, 120);
        if (/\.(exe|sh|bat|cmd|jar|apk|msi|php|py|dll|scr)$/i.test(key)) {
          return Response.json({ error: "Định dạng tệp không được phép." }, { status: 400, headers: cors });
        }

        const client = new S3Client({
          region: "auto",
          endpoint,
          credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        });

        const uploadUrl = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
          { expiresIn: 300 },
        );

        return Response.json(
          {
            uploadUrl,
            key,
            contentType,
            publicUrl: `${publicDomain}/${key}`,
          },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },
    },
  },
});
