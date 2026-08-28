/**
 * Device Signal — thu thập & gửi thông tin thiết bị cho hệ thống Anti-Clone.
 * Không polling. Chỉ gửi khi đăng nhập / mở app (throttle 10 phút).
 */
import { supabase } from "@/lib/db/router";
import { getDeviceFingerprint, getPublicIp } from "@/lib/device-fingerprint";
import { db3 } from "@/lib/db/router";

const COOKIE_KEY = "fwb_device_cookie_v1";
const LAST_SENT_KEY = "fwb_device_signal_at";
const THROTTLE_MS = 10 * 60_000;

export function getDeviceCookieId(): string {
  try {
    const cached = localStorage.getItem(COOKIE_KEY);
    if (cached) return cached;
  } catch { /* ignore */ }
  const id =
    (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
  try {
    localStorage.setItem(COOKIE_KEY, id);
    document.cookie = `fwb_did=${id}; path=/; max-age=31536000; SameSite=Lax`;
  } catch { /* ignore */ }
  return id;
}

export function parseUserAgent(ua = navigator.userAgent) {
  const isTablet = /iPad|Tablet/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone/i.test(ua);
  const deviceType = isTablet ? "Tablet" : isMobile ? "Điện thoại" : "Máy tính";

  let os = "Không rõ";
  if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android ([\d.]+)/i.test(ua)) os = "Android " + (ua.match(/Android ([\d.]+)/i)?.[1] ?? "");
  else if (/iPhone OS ([\d_]+)|CPU OS ([\d_]+)/i.test(ua))
    os = "iOS " + (ua.match(/(?:iPhone OS|CPU OS) ([\d_]+)/i)?.[1] ?? "").replace(/_/g, ".");
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Không rõ";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FBAV|FBAN/i.test(ua)) browser = "Facebook";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return { deviceType, os, browser };
}

export interface DeviceSnapshot {
  fingerprint: string;
  ip: string | null;
  userAgent: string;
  deviceType: string;
  os: string;
  browser: string;
  country: string | null;
  isp: string | null;
  cookieId: string;
}

let ipMetaCache: { ip: string | null; country: string | null; isp: string | null } | null = null;

async function fetchIpMeta() {
  if (ipMetaCache) return ipMetaCache;
  const trustedIp = await getPublicIp();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      ipMetaCache = {
        ip: trustedIp,
        country: j?.country_name ?? null,
        isp: j?.org ?? null,
      };
      return ipMetaCache;
    }
  } catch { /* ignore */ }
  ipMetaCache = { ip: trustedIp, country: null, isp: null };
  return ipMetaCache;
}

export async function collectDeviceSnapshot(): Promise<DeviceSnapshot> {
  const ua = navigator.userAgent;
  const { deviceType, os, browser } = parseUserAgent(ua);
  const meta = await fetchIpMeta();
  return {
    fingerprint: getDeviceFingerprint(),
    ip: meta.ip,
    userAgent: ua,
    deviceType,
    os,
    browser,
    country: meta.country,
    isp: meta.isp,
    cookieId: getDeviceCookieId(),
  };
}

/** Kiểm tra thiết bị có bị chặn không. FAIL-OPEN: lỗi / thiếu IP → không chặn. */
export async function checkDeviceAccess(): Promise<{ blocked: boolean; scope?: string; message?: string }> {
  try {
    const snap = await collectDeviceSnapshot();
    const { data, error } = await (supabase as any).rpc("check_device_access", {
      p_fingerprint: snap.fingerprint,
      p_ip: snap.ip,
    });
    if (error || !data || (data as any).blocked !== true) return { blocked: false };
    // Không bao giờ chặn theo IP / mạng.
    if ((data as any).scope === "ip") return { blocked: false };
    return data as any;
  } catch {
    return { blocked: false };
  }
}

/** Ghi nhận tín hiệu thiết bị cho user đang đăng nhập (throttle). */
export async function reportDeviceSignal(force = false): Promise<void> {
  try {
    if (!force) {
      const last = Number(localStorage.getItem(LAST_SENT_KEY) || 0);
      if (Date.now() - last < THROTTLE_MS) return;
    }
    const snap = await collectDeviceSnapshot();
    const { data } = await (supabase as any).rpc("register_device_signal", {
      p_fingerprint: snap.fingerprint,
      p_ip: snap.ip,
      p_user_agent: snap.userAgent,
      p_device_type: snap.deviceType,
      p_os: snap.os,
      p_browser: snap.browser,
      p_country: snap.country,
      p_isp: snap.isp,
      p_cookie_id: snap.cookieId,
    });
    // Chỉ ép đăng xuất khi backend chặn hợp lệ (tài khoản / thiết bị Level 3), KHÔNG theo IP.
    const blk = data as any;
    // KILL SWITCH: không còn chặn/điều hướng theo kết quả này.
    void blk;
    localStorage.setItem(LAST_SENT_KEY, String(Date.now()));
  } catch { /* fail-open */ }
}

/** Ghi nhật ký hoạt động cho chính user hiện tại. */
export async function logMemberActivity(action: string, detail?: string): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const snap = await collectDeviceSnapshot();
    await (db3().from("member_activity_log") as any).insert({
      user_id: uid, action, detail: detail ?? null, ip: snap.ip, fingerprint: snap.fingerprint,
      metadata: {
        user_agent: snap.userAgent,
        browser: snap.browser,
        os: snap.os,
        device_type: snap.deviceType,
        country: snap.country,
        isp: snap.isp,
        cookie_id: snap.cookieId,
      },
    });

  } catch { /* ignore */ }
}
