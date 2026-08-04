// Security headers applied to every response from the Worker.
// CSP is intentionally shipped in Report-Only mode first so we can observe
// violations (Supabase realtime, inline hydration) before
// switching to enforcement. Everything else is safe to enforce immediately.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // TanStack Start ships an inline hydration script; keep 'unsafe-inline' for
  // scripts until we wire nonces. 'unsafe-eval' left OUT.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const STATIC_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  // 6 months, includeSubDomains. Preload intentionally omitted until user opts in.
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "X-DNS-Prefetch-Control": "on",
  "Content-Security-Policy-Report-Only": CSP_DIRECTIVES,
};

export function applySecurityHeaders(response: Response): Response {
  // Response headers on some runtimes are immutable — clone to be safe.
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(STATIC_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
