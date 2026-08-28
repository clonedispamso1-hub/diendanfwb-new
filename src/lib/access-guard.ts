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
import { supabase } from "@/lib/db/router";
import { collectDeviceSnapshot, getDeviceCookieId } from "@/lib/device-signal";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { shouldRun } from "@/lib/rpc-cache";

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
  // Mức 3 (Cấm toàn bộ) chặn theo tài khoản / thiết bị / cookie / IP gần nhất.
  if (scope !== "member" && scope !== "device" && scope !== "cookie" && scope !== "ip") return OPEN;
  if (Number(data.level ?? 0) < 3) return OPEN;
  return data as GateResult;
}

// Cache ngắn theo uid (5 phút) + gộp request đang bay.
// Trước đây mỗi lần đổi route / focus tab đều gọi security_gate + device_is_blocked
// → DB bị spam RPC liên tục (522 / Unhealthy). Chỉ `force = true` mới bỏ cache.
const GATE_TTL_MS = 5 * 60_000;
const inflightByUid = new Map<string, Promise<GateResult>>();
const gateCache = new Map<string, { at: number; gate: GateResult }>();

export function invalidateGateCache() {
  inflightByUid.clear();
  gateCache.clear();
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

/**
 * Phiên Admin Panel (bangchu) hợp lệ — dùng client admin riêng.
 * Fail-safe: lỗi → false.
 */
async function isApprovedBangchuAdmin(): Promise<boolean> {
  try {
    const { supabaseAdminSession } = await import(
      "@/integrations/supabase/admin-client"
    );
    const { data: auth } = await supabaseAdminSession.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return false;
    const { data } = await (supabaseAdminSession as any)
      .from("bangchu")
      .select("status,is_active")
      .eq("auth_user_id", uid)
      .maybeSingle();
    return !!data && data.status === "approved" && data.is_active === true;
  } catch {
    return false;
  }
}

/**
 * Tài khoản đang đăng nhập có phải admin không (đọc trực tiếp profiles, hoặc
 * phiên Admin Panel bangchu đã duyệt).
 * Dùng làm lớp bảo vệ CHO RIÊNG TÀI KHOẢN ADMIN — không whitelist IP/thiết bị.
 * Fail-safe: lỗi → false (coi như user thường).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    if (await isApprovedBangchuAdmin()) return true;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return false;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("is_admin, role")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return false;
    return (
      data.is_admin === true ||
      ["admin", "super_admin", "moderator"].includes(String(data.role ?? ""))
    );
  } catch {
    return false;
  }
}


/**
 * KILL SWITCH (mở khóa khẩn cấp 2026-08-28):
 * Toàn bộ cơ chế chặn IP / thiết bị / tài khoản đã được VÔ HIỆU HÓA.
 * securityGate luôn trả về OPEN → không còn redirect sang /blocked.
 */
export const ACCESS_BLOCKING_DISABLED = true;

/** Gọi cổng bảo vệ chính. Hiện luôn mở (kill switch). */
export async function securityGate(_force = true): Promise<GateResult> {
  clearDeviceBlockedSticky();
  clearBlock();
  return OPEN;
}

/** @deprecated Giữ lại phần cài đặt cũ để tham khảo — không còn được gọi. */
async function _legacySecurityGate(_force = true): Promise<GateResult> {
  if (typeof window === "undefined") return OPEN;
  const uid = await currentGateUid();


  if (!_force) {
    const hit = gateCache.get(uid);
    if (hit && Date.now() - hit.at < GATE_TTL_MS) return hit.gate;
  }

  const running = inflightByUid.get(uid);
  if (running) return running;

  const task = (async () => {
    try {
      // BƯỚC 0 — ADMIN FIRST: tài khoản admin hợp lệ luôn đi qua cổng.
      // Đây là bypass THEO TÀI KHOẢN (auth.uid → profiles.is_admin), KHÔNG phải
      // whitelist IP/thiết bị: user thường trên cùng IP/máy vẫn bị chặn bình thường.
      if (await isCurrentUserAdmin()) {
        clearDeviceBlockedSticky();
        return { blocked: false, admin: true } as GateResult;
      }

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
    const gate = await guarded;
    gateCache.set(uid, { at: Date.now(), gate });
    return gate;
  } finally {
    if (inflightByUid.get(uid) === guarded) inflightByUid.delete(uid);
  }
}

/**
 * Kiểm tra nền có throttle: dùng cho các chỗ chỉ cần "để chắc" (focus tab,
 * bfcache, tracking). Tối đa 1 lần / 5 phút cho mỗi ngữ cảnh.
 */
export async function securityGateThrottled(context = "background"): Promise<GateResult> {
  if (typeof window === "undefined") return OPEN;
  if (!shouldRun(`gate:${context}`, GATE_TTL_MS)) return securityGate(false);
  return securityGate(false);
}




/** Cổng đăng ký. Đã vô hiệu hóa — luôn cho phép. */
export async function registrationGate(_phone?: string | null): Promise<GateResult> {
  return OPEN;
}

/** Đã vô hiệu hóa: không ép đăng xuất, không chuyển sang /blocked. */
export async function forceLogout(gate: GateResult) {
  invalidateGateCache();
  clearDeviceBlockedSticky();
  void gate;
}

/* ------------------------------------------------------------------ *
 * Trang /blocked: không còn được dùng để chặn ai.
 * ------------------------------------------------------------------ */

/** Đang đứng ở route /blocked? */
export function isBlockedRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/blocked");
}

/** Cờ dính khóa của THIẾT BỊ này — đã vô hiệu hóa. */
const STICKY_KEY = "fwb_dev_blk";

export function markDeviceBlocked() {
  // Kill switch: không bao giờ đánh dấu thiết bị bị khóa nữa.
  clearDeviceBlockedSticky();
}

export function isDeviceBlockedSticky(): boolean {
  return false;
}


export function clearDeviceBlockedSticky() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
}
