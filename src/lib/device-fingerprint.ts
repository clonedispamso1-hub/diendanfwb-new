/**
 * Tạo fingerprint đơn giản (không cần thư viện ngoài) cho trình duyệt/thiết bị.
 * Lưu vào localStorage để các phiên sau dùng cùng 1 fingerprint.
 *
 * Cũng cố gắng lấy IP công cộng (best-effort) qua dịch vụ ipify.
 * Nếu fail (mạng chặn), trả về null cho IP — server vẫn dựa thêm fingerprint.
 */

const FP_KEY = "fwb_device_fp_v2";

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

  // CHỈ dùng đặc trưng PHẦN CỨNG / HỆ ĐIỀU HÀNH — không dùng thông tin riêng
  // của trình duyệt (tên browser, canvas, ngôn ngữ). Nhờ vậy cùng một máy
  // (VD: iPhone 12) mở bằng Safari hay Chrome đều ra CÙNG một fingerprint.
  const parts: string[] = [];
  try {
    const ua = navigator.userAgent || "";
    // Chỉ trích xuất họ hệ điều hành + phiên bản (giống nhau ở mọi trình duyệt trên máy đó)
    let osTag = "unknown";
    if (/Windows NT ([\d.]+)/i.test(ua)) osTag = "win-" + (ua.match(/Windows NT ([\d.]+)/i)?.[1] ?? "");
    else if (/Android ([\d.]+)/i.test(ua)) osTag = "android-" + (ua.match(/Android ([\d.]+)/i)?.[1] ?? "");
    else if (/(?:iPhone OS|CPU OS) ([\d_]+)/i.test(ua))
      osTag = "ios-" + (ua.match(/(?:iPhone OS|CPU OS) ([\d_]+)/i)?.[1] ?? "").replace(/_/g, ".");
    else if (/iPad|iPhone|iPod/i.test(ua)) osTag = "ios";
    else if (/Mac OS X/i.test(ua)) osTag = "macos";
    else if (/CrOS/i.test(ua)) osTag = "chromeos";
    else if (/Linux/i.test(ua)) osTag = "linux";
    parts.push(osTag);
    parts.push(String((navigator as any).platform ?? ""));
    parts.push(String((navigator as any).hardwareConcurrency ?? ""));
    parts.push(String((navigator as any).deviceMemory ?? ""));
    parts.push(String((navigator as any).maxTouchPoints ?? ""));
    // Kích thước màn hình vật lý (chuẩn hoá theo chiều nhỏ/lớn để không đổi khi xoay máy)
    const w = Number(screen.width) || 0;
    const h = Number(screen.height) || 0;
    parts.push(`${Math.min(w, h)}x${Math.max(w, h)}x${screen.colorDepth}`);
    parts.push(String(window.devicePixelRatio ?? ""));
    parts.push((Intl.DateTimeFormat().resolvedOptions().timeZone) || "");
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
