import { createFileRoute } from "@tanstack/react-router";

/**
 * Album HOT media relay: phát lại đúng URL Catbox đã lưu qua cùng tên miền website.
 * Lý do: files.catbox.moe bị chặn/không ổn định trên nhiều mạng di động (4G) nên
 * <img>/<video> trên điện thoại bị trắng dù desktop (Wi-Fi) xem được.
 * Chỉ cho phép host Catbox; hỗ trợ Range để video tua/phát được trên iOS.
 */
const ALLOWED_HOSTS = new Set(["files.catbox.moe", "litter.catbox.moe"]);
const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export const Route = createFileRoute("/api/public/hot-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try { target = new URL(raw); } catch { return new Response("Bad url", { status: 400 }); }
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
          return new Response("Host not allowed", { status: 403 });
        }
        const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
        const range = request.headers.get("range");
        if (range && /^bytes=\d*-\d*$/.test(range)) headers["Range"] = range;
        const upstream = await fetch(target.toString(), { headers });
        if (!upstream.ok && upstream.status !== 206) return new Response("Upstream error", { status: 502 });
        const out = new Headers();
        for (const h of PASS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
        if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");
        out.set("Cache-Control", "public, max-age=86400");
        out.set("X-Content-Type-Options", "nosniff");
        return new Response(upstream.body, { status: upstream.status, headers: out });
      },
    },
  },
});
