/**
 * Tạo fingerprint đơn giản (không cần thư viện ngoài) cho trình duyệt/thiết bị.
 * Lưu vào localStorage để các phiên sau dùng cùng 1 fingerprint.
 *
 * Cũng cố gắng lấy IP công cộng (best-effort) qua dịch vụ ipify.
 * Nếu fail (mạng chặn), trả về null cho IP — server vẫn dựa thêm fingerprint.
 */

const FP_KEY = "fwb_device_fp_v1";

function hashString(input: string): string {
  // FNV-1a 32-bit, đủ dùng cho fingerprint client-side
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

export function getDeviceFingerprint(): string {
  try {
    const cached = localStorage.getItem(FP_KEY);
    if (cached) return cached;
  } catch {
    /* ignore */
  }

  const parts: string[] = [];
  try {
    parts.push(navigator.userAgent || "");
    parts.push(navigator.language || "");
    parts.push(String((navigator as any).hardwareConcurrency ?? ""));
    parts.push(String((navigator as any).deviceMemory ?? ""));
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    parts.push(String(new Date().getTimezoneOffset()));
    parts.push((Intl.DateTimeFormat().resolvedOptions().timeZone) || "");

    // Canvas fingerprint nhẹ
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("fwb-fp", 2, 2);
      parts.push(canvas.toDataURL());
    }
  } catch {
    /* ignore */
  }

  const fp = hashString(parts.join("|"));
  try {
    localStorage.setItem(FP_KEY, fp);
  } catch {
    /* ignore */
  }
  return fp;
}

export async function getPublicIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch("/api/public/client-ip", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.ip === "string" && data.ip.trim()) return data.ip.trim();
    }
  } catch {
    // Fallback below is only for local/dev proxies that do not expose a public IP.
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.ip === "string" ? data.ip : null;
  } catch {
    return null;
  }
}
