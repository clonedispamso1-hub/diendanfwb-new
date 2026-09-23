import { createFileRoute } from "@tanstack/react-router";

/**
 * CẮT VIDEO PHÍA SERVER cho mục "Đăng bài → Video" của Tài khoản thứ hai.
 *
 * Nhận URL video gốc + số giây tối đa (mặc định 300s = 5 phút), sau đó nhờ
 * Cloudinary render lại một file video ĐÃ CẮT (eager transformation `eo_<giây>`)
 * và trả về URL của file đã cắt. Đây là cắt thật ở server, không phải cắt preview.
 *
 * Chỉ Admin (profiles.is_admin = true) được gọi.
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_LIMIT_SECONDS = 300;

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearer(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function getAdminUserId(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  const url = process.env.SUPABASE_URL || SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;
  try {
    const me = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!me.ok) return null;
    const user = (await me.json()) as { id?: string };
    if (!user?.id) return null;
    const res = await fetch(
      `${url}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ is_admin?: boolean }>;
    return rows?.[0]?.is_admin === true ? user.id : null;
  } catch {
    return null;
  }
}

/** Chèn transformation cắt vào URL Cloudinary có sẵn (fallback khi không upload lại được). */
function cloudinaryTrimUrl(url: string, seconds: number): string | null {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/(upload|fetch)\//.test(url)) return null;
  if (/\/(?:so_0,)?eo_\d+\//.test(url)) return url;
  return url.replace(/\/(upload|fetch)\//, `/$1/so_0,eo_${seconds}/`);
}

export const Route = createFileRoute("/api/public/clone-video-trim")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),
      GET: () => {
        const missing = [
          "CLOUDINARY_CLOUD_NAME",
          "CLOUDINARY_API_KEY",
          "CLOUDINARY_API_SECRET",
        ].filter((k) => !process.env[k]);
        return Response.json(
          { ok: missing.length === 0, missing, maxSeconds: MAX_LIMIT_SECONDS },
          { status: 200, headers: { ...cors, "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const adminId = await getAdminUserId(request);
        if (!adminId) {
          return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
        }

        let body: { url?: string; maxSeconds?: number } = {};
        try {
          body = (await request.json()) as { url?: string; maxSeconds?: number };
        } catch {
          /* body rỗng */
        }
        const src = String(body.url || "").trim();
        if (!/^https?:\/\//i.test(src)) {
          return Response.json({ error: "URL video không hợp lệ." }, { status: 400, headers: cors });
        }
        const seconds = Math.max(
          1,
          Math.min(MAX_LIMIT_SECONDS, Math.floor(Number(body.maxSeconds) || MAX_LIMIT_SECONDS)),
        );

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (cloudName && apiKey && apiSecret) {
          try {
            const timestamp = Math.floor(Date.now() / 1000);
            const folder = "posts/video-trim";
            const eager = `so_0,eo_${seconds}`;
            const toSign = `eager=${eager}&folder=${folder}&timestamp=${timestamp}`;
            const signature = await sha1Hex(`${toSign}${apiSecret}`);

            const form = new FormData();
            form.append("file", src);
            form.append("folder", folder);
            form.append("eager", eager);
            form.append("timestamp", String(timestamp));
            form.append("api_key", apiKey);
            form.append("signature", signature);

            const res = await fetch(
              `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
              { method: "POST", body: form },
            );
            const json = (await res.json()) as {
              secure_url?: string;
              duration?: number;
              eager?: Array<{ secure_url?: string }>;
              error?: { message?: string };
            };
            if (res.ok) {
              const trimmed =
                json.eager?.[0]?.secure_url ||
                (json.secure_url ? cloudinaryTrimUrl(json.secure_url, seconds) : null) ||
                json.secure_url;
              if (trimmed) {
                return Response.json(
                  { url: trimmed, seconds, trimmed: true, source: "cloudinary" },
                  { headers: { ...cors, "cache-control": "no-store" } },
                );
              }
            }
            console.error("[clone-video-trim] cloudinary error", json?.error?.message || res.status);
          } catch (e) {
            console.error("[clone-video-trim] cloudinary request failed", e);
          }
        }

        // Fallback: video đã nằm trên Cloudinary → cắt bằng transformation URL.
        const fallback = cloudinaryTrimUrl(src, seconds);
        if (fallback) {
          return Response.json(
            { url: fallback, seconds, trimmed: true, source: "transform" },
            { headers: { ...cors, "cache-control": "no-store" } },
          );
        }

        return Response.json(
          {
            error: "Không cắt được video ở server.",
            detail: "Cloudinary chưa được cấu hình (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET).",
          },
          { status: 503, headers: cors },
        );
      },
    },
  },
});
