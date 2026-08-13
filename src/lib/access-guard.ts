/**
 * Access Guard — cổng kiểm tra khóa MEMBER / DEVICE / IP ở BACKEND.
 * Mọi quyết định đều do RPC `security_gate` / `registration_gate` trả về;
 * frontend chỉ hiển thị và ép đăng xuất.
 */
import { supabase } from "@/integrations/supabase/client";
import { collectDeviceSnapshot } from "@/lib/device-signal";

export type BlockScope = "member" | "device" | "ip" | "cookie";

export interface GateResult {
  blocked: boolean;
  scope?: BlockScope;
  level?: number;
  reason?: string | null;
  until?: string | null;
  message?: string;
  admin?: boolean;
}

const BLOCKED_MESSAGE = "Thiết bị hoặc mạng của bạn đã bị khóa.";

function closedGate(reason: string): GateResult {
  return { blocked: true, scope: "ip", level: 3, reason, message: BLOCKED_MESSAGE };
}

export const BLOCK_STORAGE_KEY = "fwb_block_info";

/** Gọi cổng bảo vệ chính (mở web / trước & sau đăng nhập). */
export async function securityGate(): Promise<GateResult> {
  try {
    const snap = await collectDeviceSnapshot();
    if (!snap.ip) return closedGate("public_ip_unavailable");
    const { data, error } = await (supabase as any).rpc("security_gate", {
      p_fingerprint: snap.fingerprint,
      p_ip: snap.ip,
      p_cookie: snap.cookieId,
    });
    if (error || !data || typeof data.blocked !== "boolean") return closedGate("security_gate_unavailable");
    return data as GateResult;
  } catch {
    return closedGate("security_gate_failed");
  }
}

/** Cổng đăng ký: Device + IP + Cookie + tài khoản liên quan. */
export async function registrationGate(phone?: string | null): Promise<GateResult> {
  try {
    const snap = await collectDeviceSnapshot();
    if (!snap.ip) return closedGate("public_ip_unavailable");
    const { data, error } = await (supabase as any).rpc("registration_gate", {
      p_fingerprint: snap.fingerprint,
      p_ip: snap.ip,
      p_cookie: snap.cookieId,
      p_phone: phone ?? null,
    });
    if (error || !data || typeof data.blocked !== "boolean") return closedGate("registration_gate_unavailable");
    return data as GateResult;
  } catch {
    return closedGate("registration_gate_failed");
  }
}

export const BLOCK_COOKIE_KEY = "fwb_blk";

/** Cờ khóa lưu song song localStorage + cookie (sống sót khi xoá localStorage). */
export function rememberBlock(gate: GateResult) {
  try { localStorage.setItem(BLOCK_STORAGE_KEY, JSON.stringify(gate)); } catch { /* ignore */ }
  try { sessionStorage.setItem(BLOCK_STORAGE_KEY, "1"); } catch { /* ignore */ }
  try {
    document.cookie = `${BLOCK_COOKIE_KEY}=1; path=/; max-age=31536000; SameSite=Lax`;
  } catch { /* ignore */ }
}

export function hasBlockCookie(): boolean {
  try {
    return document.cookie.split(";").some((c) => c.trim().startsWith(`${BLOCK_COOKIE_KEY}=1`));
  } catch { return false; }
}

export function readBlock(): GateResult | null {
  try {
    const raw = localStorage.getItem(BLOCK_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as GateResult;
  } catch { /* ignore */ }
  if (hasBlockCookie()) return { blocked: true, scope: "device", level: 3 };
  return null;
}

export function clearBlock() {
  try { localStorage.removeItem(BLOCK_STORAGE_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(BLOCK_STORAGE_KEY); } catch { /* ignore */ }
  try { document.cookie = `${BLOCK_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`; } catch { /* ignore */ }
}


/** Ép đăng xuất + chuyển sang trang thông báo khóa. */
export async function forceLogout(gate: GateResult) {
  rememberBlock(gate);
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/blocked")) {
    window.location.replace("/blocked");
  }
}
