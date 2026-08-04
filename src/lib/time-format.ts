/**
 * Smart timestamp — Vietnamese.
 *   <1m  → "Mới đăng"
 *   <60m → "X phút trước"
 *   <24h → "X giờ trước"
 *   ≥24h → "DD/MM/YYYY • HH:MM"
 */
export function formatRelativeTime(input?: string | number | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  const ts = d.getTime();
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Mới đăng";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  return formatPostDateTime(d);
}

/**
 * formatPostDateTime — absolute date+time.
 *   Format: DD/MM/YYYY • HH:MM (24h, zero-padded)
 */
export function formatPostDateTime(input?: string | number | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  const ts = d.getTime();
  if (Number.isNaN(ts)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} • ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
