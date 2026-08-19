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
import { collectDeviceSnapshot, getDeviceCookieId } from "@/lib/device-signal";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

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

// KHÔNG cache trạng thái khóa: mỗi lần kiểm tra đều query thẳng Database.
// Chỉ gộp các request trùng nhau đang bay (inflight) để tránh spam mạng.
const inflightByUid = new Map<string, Promise<GateResult>>();

export function invalidateGateCache() {
  inflightByUid.clear();
}

/** uid hiện tại ("anon" nếu chưa đăng nhập). */
export async function currentGateUid(): Promise<string> {
  try {
    return (await supabase.auth.getSession()).data.session?.user?.id ?? "anon";
  } catch {
    return "anon";
  }
}

/** Kiểm tra thiết bị có nằm trong blocked_devices / blocked_cookies không. */
async function deviceIsBlocked(fingerprint: string | null, cookieId: string | null): Promise<boolean> {
  try {
    const { data, error } = await (supabase as any).rpc("device_is_blocked", {
      p_fingerprint: fingerprint,
      p_cookie: cookieId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Gọi cổng bảo vệ chính. Luôn hỏi trực tiếp Database. Fail-open. */
export async function securityGate(_force = true): Promise<GateResult> {
  if (typeof window === "undefined") return OPEN;
  const uid = await currentGateUid();

  const running = inflightByUid.get(uid);
  if (running) return running;

  const task = (async () => {
    try {
      // Không chờ lấy IP công khai (chậm & không dùng để chặn) — tối đa 1.2s.
      const snap = await Promise.race([
        collectDeviceSnapshot(),
        new Promise<null>((r) => setTimeout(() => r(null), 1200)),
      ]);
      const fingerprint = snap?.fingerprint ?? getDeviceFingerprint();
      const cookieId = snap?.cookieId ?? getDeviceCookieId();

      // RPC có thể treo (DB bận / hàm chạy lâu) → hết 5s coi như không có kết luận.
      const rpcResult = await Promise.race([
        (supabase as any).rpc("security_gate", {
          p_fingerprint: fingerprint,
          p_ip: snap?.ip ?? null,
          p_cookie: cookieId,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      if (rpcResult && !rpcResult.error) {
        const gate = normalize(rpcResult.data);
        if (gate.admin || gate.blocked) return gate;
      }

      // Khóa theo thiết bị (device fingerprint ban) — áp dụng cả khi chưa đăng nhập.
      const deviceBlocked = await Promise.race([
        deviceIsBlocked(fingerprint, cookieId),
        new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
      ]);
      if (deviceBlocked) {
        return {
          blocked: true,
          scope: "device" as BlockScope,
          level: 3,
          message: "Thiết bị này đã bị khóa vĩnh viễn.",
        };
      }
      return OPEN;
    } catch {
      return OPEN;
    }
  })();

  // Chốt chặn cuối cùng: dù bên trong có gì treo, hàm này luôn trả kết quả <= 6s.
  const guarded = Promise.race([
    task,
    new Promise<GateResult>((r) => setTimeout(() => r(OPEN), 6000)),
  ]);

  inflightByUid.set(uid, guarded);
  try {
    return await guarded;
  } finally {
    if (inflightByUid.get(uid) === guarded) inflightByUid.delete(uid);
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

/* ------------------------------------------------------------------ *
 * Trang /blocked: tuyệt đối không cho bất kỳ logic auth nào redirect.
 * ------------------------------------------------------------------ */

/** Đang đứng ở route /blocked? */
export function isBlockedRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/blocked");
}

/** Cờ dính khóa của THIẾT BỊ này (đặt sau khi đã xoá sạch storage). */
const STICKY_KEY = "fwb_dev_blk";

export function markDeviceBlocked() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STICKY_KEY, "1"); } catch { /* ignore */ }
  try { sessionStorage.setItem(STICKY_KEY, "1"); } catch { /* ignore */ }
}

export function isDeviceBlockedSticky(): boolean {
  if (typeof window === "undefined") return false;
  try { if (localStorage.getItem(STICKY_KEY) === "1") return true; } catch { /* ignore */ }
  try { if (sessionStorage.getItem(STICKY_KEY) === "1") return true; } catch { /* ignore */ }
  return false;
}

export function clearDeviceBlockedSticky() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
}
