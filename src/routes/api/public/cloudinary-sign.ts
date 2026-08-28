import { createFileRoute } from "@tanstack/react-router";

/**
 * Ký (sign) upload Cloudinary ở phía server.
 *
 * Client KHÔNG BAO GIỜ thấy API Secret — chỉ nhận signature + timestamp
 * dùng một lần cho đúng folder/resource_type yêu cầu.
 *
 * Yêu cầu: người gọi phải đăng nhập (Authorization: Bearer <supabase token>).
 */

const SUPABASE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Chỉ cho phép các folder do app quản lý. */
const FOLDER_RE = /^[a-z0-9][a-z0-9._/-]{0,60}$/i;

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

/** Trả về user id nếu token hợp lệ, ngược lại null. */
async function getUserId(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  try {
    const url = process.env.SUPABASE_URL || SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;
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

/** Kho GIF dùng chung — chỉ Admin được upload. */
function isGifFolder(folder: string): boolean {
  return /(^|\/)gif(\/|$)/i.test(folder);
}

async function isAdminUser(request: Request, userId: string): Promise<boolean> {
  try {
    const url = process.env.SUPABASE_URL || SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(
      `${url}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${bearer(request)}` } },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ is_admin?: boolean }>;
    return rows?.[0]?.is_admin === true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/cloudinary-sign")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: cors }),
      // Health check: xem endpoint còn sống & biến môi trường nào đang thiếu.
      GET: () => {
        const missing = [
          "CLOUDINARY_CLOUD_NAME",
          "CLOUDINARY_API_KEY",
          "CLOUDINARY_API_SECRET",
        ].filter((k) => !process.env[k]);
        return Response.json(
          { ok: missing.length === 0, missing },
          { status: 200, headers: { ...cors, "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!cloudName || !apiKey || !apiSecret) {
          const missing = [
            !cloudName && "CLOUDINARY_CLOUD_NAME",
            !apiKey && "CLOUDINARY_API_KEY",
            !apiSecret && "CLOUDINARY_API_SECRET",
          ].filter(Boolean);
          console.error("[cloudinary-sign] Thiếu biến môi trường:", missing.join(", "));
          return Response.json(
            {
              error: "Cloudinary chưa được cấu hình.",
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

        let body: { folder?: string } = {};
        try {
          body = (await request.json()) as { folder?: string };
        } catch {
          /* body rỗng cũng được */
        }

        const folder = String(body.folder || "candy").replace(/^\/+|\/+$/g, "");
        if (!FOLDER_RE.test(folder)) {
          return Response.json({ error: "Invalid folder" }, { status: 400, headers: cors });
        }

        if (isGifFolder(folder) && !(await isAdminUser(request, userId))) {
          return Response.json(
            { error: "Forbidden", detail: "Chỉ Admin được tải GIF lên kho dùng chung." },
            { status: 403, headers: cors },
          );
        }

        const timestamp = Math.floor(Date.now() / 1000);
        // Params ký phải khớp CHÍNH XÁC params gửi lên Cloudinary.
        const toSign = `folder=${folder}&timestamp=${timestamp}`;
        const signature = await sha1Hex(`${toSign}${apiSecret}`);

        return Response.json(
          { cloudName, apiKey, timestamp, folder, signature },
          { headers: { ...cors, "cache-control": "no-store" } },
        );
      },
    },
  },
});
