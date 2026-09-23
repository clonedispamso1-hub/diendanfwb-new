import { createFileRoute } from "@tanstack/react-router";

/**
 * Upload ảnh (đã nén ở trình duyệt) vào Supabase #3 — bucket sẵn có `feedback`.
 *
 * • Service Role Key của Supabase #3 CHỈ nằm ở server (env `SB3_SERVICE_ROLE_KEY`).
 * • Người gọi bắt buộc đăng nhập (Authorization: Bearer <token Supabase #1>).
 * • KHÔNG tạo bucket mới, KHÔNG đổi RLS: server ghi bằng service key.
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

/** Supabase #3 (logs/stats) — public URL, không phải bí mật. */
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
/** Bucket public ĐÃ TỒN TẠI trên Supabase #3. */
export const SB3_BUCKET = "feedback";

const MAX_BYTES = 2 * 1024 * 1024; // trần bucket
const ALLOWED = new Set(["image/webp", "image/png", "image/jpeg", "image/jpg"]);
const FOLDER_RE = /^[a-z0-9][a-z0-9._/-]{0,60}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

export const Route = createFileRoute("/api/public/sb3-upload")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),

      GET: () => {
        const missing = process.env["SB3_SERVICE_ROLE_KEY"] ? [] : ["SB3_SERVICE_ROLE_KEY"];
        return Response.json(
          { ok: missing.length === 0, bucket: SB3_BUCKET, missing },
          { status: 200, headers: { ...cors, "cache-control": "no-store" } },
        );
      },

      POST: async ({ request }) => {
        const serviceKey = process.env["SB3_SERVICE_ROLE_KEY"];
        if (!serviceKey) {
          return Response.json(
            {
              error: "Kho ảnh Supabase #3 chưa được cấu hình.",
              detail: "Thiếu biến môi trường: SB3_SERVICE_ROLE_KEY",
            },
            { status: 503, headers: cors },
          );
        }

        const userId = await getUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        const url = new URL(request.url);
        const folder = String(url.searchParams.get("folder") || "images").replace(
          /^\/+|\/+$/g,
          "",
        );
        if (!FOLDER_RE.test(folder)) {
          return Response.json({ error: "Invalid folder" }, { status: 400, headers: cors });
        }

        const contentType = (request.headers.get("content-type") || "").split(";")[0]!.toLowerCase();
        if (!ALLOWED.has(contentType)) {
          return Response.json(
            { error: "Chỉ nhận ảnh WebP, PNG hoặc JPEG." },
            { status: 400, headers: cors },
          );
        }

        const body = new Uint8Array(await request.arrayBuffer());
        if (!body.byteLength) {
          return Response.json({ error: "Tệp rỗng." }, { status: 400, headers: cors });
        }
        if (body.byteLength > MAX_BYTES) {
          return Response.json(
            { error: "Ảnh vượt quá 2MB — hãy nén trước khi tải lên." },
            { status: 413, headers: cors },
          );
        }

        const rawName =
          String(url.searchParams.get("filename") || "image")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(-80) || "image";
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const key = `${folder}/${stamp}-${rawName}`;

        const up = await fetch(
          `${SB3_URL}/storage/v1/object/${SB3_BUCKET}/${encodeURI(key)}`,
          {
            method: "POST",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "content-type": contentType,
              "cache-control": "31536000",
              "x-upsert": "true",
            },
            body,
          },
        );
        if (!up.ok) {
          const detail = (await up.text()).slice(0, 300);
          return Response.json(
            { error: `Tải ảnh lên Supabase #3 thất bại (${up.status}).`, detail },
            { status: 502, headers: cors },
          );
        }

        return Response.json(
          {
            key,
            bucket: SB3_BUCKET,
            publicUrl: `${SB3_URL}/storage/v1/object/public/${SB3_BUCKET}/${encodeURI(key)}`,
            bytes: body.byteLength,
          },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },
    },
  },
});
