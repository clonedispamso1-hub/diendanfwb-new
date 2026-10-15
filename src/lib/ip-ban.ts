/**
 * Logic thuần (không I/O) cho kiểm tra BAN IP mức 3 — dùng chung server + test.
 * IP chỉ được lấy từ header do Cloudflare gắn (cf-connecting-ip); client không
 * thể tự khai báo IP.
 */
export type IpBanRow = { ip: string | null; level: number | null; expires_at: string | null };

export type IpBanStatus =
  | { status: "blocked"; level: number; until: string | null }
  | { status: "clear" }
  | { status: "unknown"; reason: "no_trusted_ip" }
  | { status: "error"; reason: string };

/** Chuẩn hoá IP từ header tin cậy. Trả null nếu không hợp lệ. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const c = value.split(",")[0]?.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!c || c.length > 64 || !/^[0-9a-f:.]+$/.test(c)) return null;
  return c.startsWith("::ffff:") ? c.slice(7) : c;
}

/** Chỉ tin cf-connecting-ip (Cloudflare luôn ghi đè header này, client không giả được). */
export function trustedClientIp(get: (name: string) => string | null | undefined): string | null {
  return normalizeIp(get("cf-connecting-ip"));
}

/** Lệnh cấm còn hiệu lực: level >= 3 và (vĩnh viễn hoặc chưa hết hạn). */
export function evaluateIpBan(rows: IpBanRow[], now = Date.now()): IpBanStatus {
  for (const r of rows) {
    if (Number(r.level ?? 3) < 3) continue;
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    return { status: "blocked", level: Number(r.level ?? 3), until: r.expires_at };
  }
  return { status: "clear" };
}
