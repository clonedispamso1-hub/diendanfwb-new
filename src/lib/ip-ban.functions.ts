/**
 * Server function kiểm tra BAN IP mức 3 (bảng blocked_ips trên DB core).
 * IP lấy từ header của request phía máy chủ — KHÔNG nhận IP từ trình duyệt.
 */
import { createServerFn } from "@tanstack/react-start";
import { evaluateIpBan, trustedClientIp, type IpBanRow, type IpBanStatus } from "@/lib/ip-ban";

export const checkIpBanFn = createServerFn({ method: "GET" }).handler(async (): Promise<IpBanStatus> => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip = trustedClientIp((n) => getRequestHeader(n) ?? null);
  if (!ip) return { status: "unknown", reason: "no_trusted_ip" };

  const { SUPABASE_INSTANCES } = await import("@/lib/db/config");
  const cfg = (SUPABASE_INSTANCES as any).primary ?? Object.values(SUPABASE_INSTANCES as any)[0];
  if (!cfg?.url || !cfg?.anonKey) return { status: "error", reason: "missing_config" };

  try {
    const url = `${cfg.url}/rest/v1/blocked_ips?select=ip,level,expires_at&ip=eq.${encodeURIComponent(ip)}&order=created_at.desc&limit=10`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { headers: { apikey: cfg.anonKey }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { status: "error", reason: `http_${res.status}` };
    const rows = (await res.json()) as IpBanRow[];
    return evaluateIpBan(Array.isArray(rows) ? rows : []);
  } catch (e: any) {
    return { status: "error", reason: e?.name === "AbortError" ? "timeout" : "network" };
  }
});
