/**
 * Access Guard — cổng kiểm tra khóa Level 3.
 *
 * NGUYÊN TẮC (sau bản fix khẩn cấp):
 * - CHỈ chặn khi backend trả về scope = "member" (tài khoản hiện tại ban_level >= 3)
 *   hoặc scope = "device"/"cookie" (thiết bị này đã từng đăng nhập tài khoản Level 3).
 * - TUYỆT ĐỐI không chặn theo IP / mạng Wi-Fi (scope = "ip" bị bỏ qua).
 * - FAIL-OPEN: lỗi mạng, RPC lỗi, không lấy được IP → cho phép truy cập.
 * - KHÔNG lưu cờ block toàn cục vào cookie / localStorage / sessionStorage.
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

const OPEN: GateResult = { blocked: false };

/** Cờ block cũ (đã bỏ) — chỉ dùng để dọn dữ liệu tồn đọng trên máy người dùng. */
export const BLOCK_STORAGE_KEY = "fwb_block_info";
export const BLOCK_COOKIE_KEY = "fwb_blk";

/** Dọn sạch mọi cờ block toàn cục còn sót lại từ phiên bản trước. */
export function clearBlock() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(BLOCK_STORAGE_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(BLOCK_STORAGE_KEY); } catch { /* ignore */ }
  try { document.cookie = `${BLOCK_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`; } catch { /* ignore */ }
}

/** @deprecated Không còn lưu cờ block toàn cục — chỉ dọn dữ liệu cũ. */
export function rememberBlock(_gate: GateResult) {
  clearBlock();
}

/** @deprecated Không đọc block từ cookie/localStorage nữa (gây block oan). */
export function readBlock(): GateResult | null {
  return null;
}

/** @deprecated Cookie block toàn cục đã bị loại bỏ. */
export function hasBlockCookie(): boolean {
  return false;
}

/**
 * Chỉ giữ lại quyết định chặn thực sự hợp lệ:
 * tài khoản Level 3, hoặc thiết bị/cookie đã gắn tài khoản Level 3.
 */
function normalize(data: any): GateResult {
  if (!data || typeof data !== "object") return OPEN;
  if (data.admin === true) return { blocked: false, admin: true };
  if (data.blocked !== true) return OPEN;
  const scope = data.scope as BlockScope | undefined;
  // Không bao giờ chặn vì IP / mạng, và không chặn khi backend không nêu rõ scope.
  if (scope !== "member" && scope !== "device" && scope !== "cookie") return OPEN;
  if (Number(data.level ?? 0) < 3) return OPEN;
  return data as GateResult;
}

// Cache ngắn để login/register không gọi security_gate nhiều lần liên tiếp.
let cache: { at: number; key: string; result: GateResult } | null = null;
let inflight: Promise<GateResult> | null = null;
const CACHE_MS = 30_000;

export function invalidateGateCache() {
  cache = null;
}

/** Gọi cổng bảo vệ chính. Fail-open. */
export async function securityGate(force = false): Promise<GateResult> {
  if (typeof window === "undefined") return OPEN;
  const uid = (await supabase.auth.getSession()).data.session?.user?.id ?? "anon";
  if (!force && cache && cache.key === uid && Date.now() - cache.at < CACHE_MS) return cache.result;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await collectDeviceSnapshot();
      const { data, error } = await (supabase as any).rpc("security_gate", {
        p_fingerprint: snap.fingerprint,
        p_ip: snap.ip,
        p_cookie: snap.cookieId,
      });
      if (error) return OPEN;
      return normalize(data);
    } catch {
      return OPEN;
    }
  })();
  try {
    const result = await inflight;
    cache = { at: Date.now(), key: uid, result };
    return result;
  } finally {
    inflight = null;
  }
}

/** Cổng đăng ký. Fail-open. */
export async function registrationGate(phone?: string | null): Promise<GateResult> {
  if (typeof window === "undefined") return OPEN;
  try {
    const snap = await collectDeviceSnapshot();
    const { data, error } = await (supabase as any).rpc("registration_gate", {
      p_fingerprint: snap.fingerprint,
      p_ip: snap.ip,
      p_cookie: snap.cookieId,
      p_phone: phone ?? null,
    });
    if (error) return OPEN;
    return normalize(data);
  } catch {
    return OPEN;
  }
}

/** Ép đăng xuất + chuyển sang trang thông báo khóa (chỉ khi block hợp lệ). */
export async function forceLogout(gate: GateResult) {
  invalidateGateCache();
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/blocked")) {
    window.location.replace("/blocked");
  }
  void gate;
}
