import { createFileRoute } from "@tanstack/react-router";

function firstHeaderIp(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.split(",")[0]?.trim().replace(/^\[|\]$/g, "");
  if (!candidate || candidate.length > 64 || !/^[0-9a-f:.]+$/i.test(candidate)) return null;
  return candidate.startsWith("::ffff:") ? candidate.slice(7) : candidate;
}

export const Route = createFileRoute("/api/public/client-ip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = request.headers;
        const ip = firstHeaderIp(headers.get("cf-connecting-ip"))
          ?? firstHeaderIp(headers.get("x-real-ip"))
          ?? firstHeaderIp(headers.get("x-forwarded-for"));
        return Response.json(
          { ip },
          { headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});