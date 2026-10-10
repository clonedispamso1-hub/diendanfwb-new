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
import { cachedQuery } from "@/lib/request-cache";
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

/**
 * Lỗi "phiên hỏng" từ Auth (token hết hạn / invalid claims / 401-403 / refresh
 * token không hợp lệ). Gặp lỗi này thì KHÔNG retry — dọn session local.
 */
function isDeadSessionError(err: any): boolean {
  if (!err) return false;
  const status = Number(err.status ?? err.code ?? 0);
  if (status === 401 || status === 403) return true;
  const msg = String(err.message ?? "").toLowerCase();
  return /expired|invalid claims|invalid jwt|refresh token|session_not_found|user from sub claim/.test(msg);
}

/**
 * uid đã được Auth xác thực cho 1 client cụ thể. Không có session local → null
 * ngay (không gọi mạng). Session hỏng → signOut({scope:"local"}) đúng client đó
 * một lần, trả null (client không còn token → lần sau không gọi lại).
 */
// Cache kết quả xác thực theo access_token (chỉ trong bộ nhớ, tối đa 60s) +
// gộp các lần gọi đồng thời. Token đổi → khoá khác → kiểm tra lại ngay.
// Chỉ giữ uid, KHÔNG lưu token ra ngoài bộ nhớ.
const VERIFIED_TTL_MS = 60_000;
const verifiedCache = new WeakMap<object, { token: string; at: number; uid: string | null }>();
const verifiedInflight = new WeakMap<object, { token: string; p: Promise<string | null> }>();

async function verifiedUid(client: any): Promise<string | null> {
  const { data: sess } = await client.auth.getSession();
  const token: string | undefined = sess?.session?.access_token;
  if (!sess?.session || !token) return null;

  const hit = verifiedCache.get(client);
  if (hit && hit.token === token && Date.now() - hit.at < VERIFIED_TTL_MS) return hit.uid;
  const running = verifiedInflight.get(client);
  if (running && running.token === token) return running.p;

  const p = (async () => {
    const { data, error } = await client.auth.getUser();
    if (error) {
      verifiedCache.delete(client);
      if (isDeadSessionError(error)) {
        try { await client.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
      }
      return null;
    }
    const uid = data?.user?.id ?? null;
    verifiedCache.set(client, { token, at: Date.now(), uid });
    return uid;
  })();
  verifiedInflight.set(client, { token, p });
  try {
    return await p;
  } finally {
    if (verifiedInflight.get(client)?.p === p) verifiedInflight.delete(client);
  }
}

/** uid từ session local (không gọi /auth/v1/user) — chỉ cần biết trạng thái đăng nhập. */
async function sessionUid(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  return sess?.session?.user?.id ?? null;
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
  // Dedupe + cache 60s: nhiều nơi (watchdog, access-gate, blocked page) cùng hỏi
  // một câu → chỉ 1 request thật thay vì spam RPC.
  return cachedQuery(
    `device_is_blocked:${fingerprint ?? ""}:${cookieId ?? ""}`,
    async () => {
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
    },
    60_000,
  );
}

/**
 * Trạng thái bangchu (approved + active) của phiên Admin Panel — CÓ CACHE.
 *
 * Trước đây mỗi lần securityGate / isAdminTriState chạy đều query
 * `bangchu?select=status,is_active` thật → ~2 request/phút liên tục trên máy
 * đang giữ phiên Admin. Nay cache theo uid tối đa 60s (chỉ trong bộ nhớ):
 * - Token đổi / đăng xuất → khoá không khớp → kiểm tra lại ngay.
 * - Nhiều lần gọi đồng thời → gộp thành 1 request.
 * - KHÔNG lưu token ra ngoài; KHÔNG đổi logic xác thực (vẫn đọc bangchu thật).
 */
const BANGCHU_TTL_MS = 60_000;
const bangchuCache = new Map<string, { token: string; at: number; approved: boolean }>();
const bangchuInflight = new Map<string, Promise<boolean>>();

async function isBangchuApproved(client: any, uid: string, token: string): Promise<boolean> {
  const hit = bangchuCache.get(uid);
  if (hit && hit.token === token && Date.now() - hit.at < BANGCHU_TTL_MS) return hit.approved;
  const running = bangchuInflight.get(uid);
  if (running) return running;

  const p = (async () => {
    try {
      const { data } = await (client as any)
        .from("bangchu")
        .select("status,is_active")
        .eq("auth_user_id", uid)
        .maybeSingle();
      const approved = !!data && data.status === "approved" && data.is_active === true;
      bangchuCache.set(uid, { token, at: Date.now(), approved });
      return approved;
    } catch {
      return false;
    }
  })();
  bangchuInflight.set(uid, p);
  try {
    return await p;
  } finally {
    if (bangchuInflight.get(uid) === p) bangchuInflight.delete(uid);
  }
}

/**
 * uid của phiên Admin Panel đã được Auth xác thực (GET /auth/v1/user), dùng
 * CHUNG cache 60s theo access_token + gộp request đồng thời với cổng truy cập.
 * Nhờ vậy Admin Panel và AccessGate không gọi /auth/v1/user trùng nhau.
 */
export async function verifiedAdminUid(): Promise<string | null> {
  const { supabaseAdminSession } = await import("@/integrations/supabase/admin-client");
  return verifiedUid(supabaseAdminSession);
}

/** Phiên Admin Panel hiện tại: uid + access_token (null nếu chưa đăng nhập admin). */
async function adminSessionIdentity(): Promise<{ client: any; uid: string; token: string } | null> {
  const { supabaseAdminSession } = await import("@/integrations/supabase/admin-client");
  const { data: sess } = await supabaseAdminSession.auth.getSession();
  const token: string | undefined = sess?.session?.access_token;
  if (!sess?.session || !token) return null;
  const uid = await verifiedUid(supabaseAdminSession);
  if (!uid) return null;
  return { client: supabaseAdminSession, uid, token };
}

/**
 * Phiên Admin Panel (bangchu) hợp lệ — dùng client admin riêng.
 * Fail-safe: lỗi → false.
 */
async function isApprovedBangchuAdmin(): Promise<boolean> {
  try {
    const id = await adminSessionIdentity();
    if (!id) return false;
    return await isBangchuApproved(id.client, id.uid, id.token);
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
    const uid = await sessionUid();
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
 * Kiểm tra admin 3 TRẠNG THÁI (dùng cho DevTools Guard):
 * - true  → chắc chắn là admin (bangchu đã duyệt, hoặc profiles.is_admin/role).
 * - false → chắc chắn KHÔNG phải admin (đọc profiles thành công, không có quyền;
 *           hoặc khách chưa đăng nhập).
 * - null  → CHƯA KẾT LUẬN (lỗi mạng/DB/timeout, chưa đọc được profile…).
 *           Caller TUYỆT ĐỐI không được coi null là "không phải admin".
 */
export async function isAdminTriState(): Promise<boolean | null> {
  // Phiên Admin Panel (bangchu) — lỗi ở nhánh này không kết luận gì, kiểm tra tiếp nhánh chính.
  // Dùng chung cache 60s với isApprovedBangchuAdmin → không tạo thêm request bangchu.
  try {
    const id = await adminSessionIdentity();
    if (id && (await isBangchuApproved(id.client, id.uid, id.token))) return true;
  } catch {
    /* nhánh phụ lỗi → bỏ qua, kết luận bằng nhánh chính */
  }

  try {
    // getSession đọc local: không có phiên → chắc chắn KHÔNG phải admin.
    // (getUser với khách ẩn danh trả về lỗi "session missing" → không được coi là unknown.)
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (!uid) return false; // khách chưa đăng nhập: chắc chắn không phải admin
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("is_admin, role")
      .eq("id", uid)
      .maybeSingle();
    if (error) return null; // lỗi DB → chưa kết luận
    if (!data) return null; // chưa đọc được profile → chưa kết luận
    return (
      data.is_admin === true ||
      ["admin", "super_admin", "moderator"].includes(String(data.role ?? ""))
    );
  } catch {
    return null;
  }
}

/** Cơ chế chặn ĐANG BẬT (Mức 1/2/3). */
export const ACCESS_BLOCKING_DISABLED = false;

/** Ban level của TÀI KHOẢN đang đăng nhập (0 nếu không có / lỗi / admin). */
export async function currentBanLevel(): Promise<number> {
  try {
    const uid = await sessionUid();
    if (!uid) return 0;
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("ban_level, is_banned, is_admin, account_status, status")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return 0;
    if (data.is_admin === true) return 0;
    const lvl = Number(data.ban_level ?? 0);
    if (lvl > 0) return lvl;
    const st = String(data.account_status ?? data.status ?? "");
    if (data.is_banned === true || st === "banned" || st === "suspended" || st === "banned_15") return 1;
    return 0;
  } catch {
    return 0;
  }
}

// KHÔNG BAO GIỜ chặn theo IP: nhiều thiết bị dùng chung mạng sẽ bị khóa oan.
// Mức 3 chỉ căn cứ vào TÀI KHOẢN và FINGERPRINT PHẦN CỨNG của thiết bị.

/**
 * Cổng bảo vệ chính (fail-open).
 * - Mức 3 → chặn theo tài khoản / thiết bị / cookie / IP.
 * - Mức 1-2 → trả về blocked với level tương ứng (caller đăng xuất + /locked).
 */
export async function securityGate(_force = true): Promise<GateResult> {

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

      // BƯỚC 1 — Khóa theo TÀI KHOẢN (Mức 1/2/3).
      const banLevel = await Promise.race([
        currentBanLevel(),
        new Promise<number>((r) => setTimeout(() => r(0), 5000)),
      ]);
      if (banLevel >= 1) {
        return {
          blocked: true,
          scope: "member" as BlockScope,
          level: banLevel,
          message:
            banLevel >= 3
              ? "Thiết bị này đã bị cấm vĩnh viễn."
              : "Tài khoản của bạn đã bị khóa.",
        };
      }

      // BƯỚC 2 — Thiết bị (fingerprint phần cứng) / cookie — Mức 3, kể cả khi chưa đăng nhập.
      // Tuyệt đối KHÔNG kiểm tra IP.
      const fingerprint = getDeviceFingerprint();
      const cookieId = getDeviceCookieId();

      const deviceBlocked = await Promise.race([
        deviceIsBlocked(fingerprint, cookieId),
        new Promise<boolean>((r) => setTimeout(() => r(false), 5000)),
      ]);
      if (deviceBlocked) {
        return {
          blocked: true,
          scope: "device" as BlockScope,
          level: 3,
          message: "Thiết bị này đã bị cấm vĩnh viễn.",
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

/**
 * Ép đăng xuất theo kết quả cổng — MỌI mức đều bị đá thẳng sang /blocked:
 * - Mức 3 → xoá session + đánh dấu THIẾT BỊ (fingerprint) + /blocked.
 * - Mức 1-2 → xoá session + /blocked (không đánh dấu thiết bị).
 */
export async function forceLogout(gate: GateResult) {
  invalidateGateCache();
  const level = Number(gate.level ?? 0);
  const { purgeSessionAndBlock, purgeSessionAndLock } = await import("@/lib/ban-realtime");
  if (level >= 3) {
    await purgeSessionAndBlock();
    return;
  }
  await purgeSessionAndLock();
}


/* ------------------------------------------------------------------ *
 * Trang /blocked: màn hình chặn vĩnh viễn (Mức 3).
 * ------------------------------------------------------------------ */

/** Đang đứng ở route /blocked? */
export function isBlockedRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/blocked");
}

/** Cờ dính khóa của THIẾT BỊ này (Mức 3) — chặn ngay từ frame đầu tiên. */
const STICKY_KEY = "fwb_dev_blk";

export function markDeviceBlocked() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STICKY_KEY, "1"); } catch { /* ignore */ }
}

export function isDeviceBlockedSticky(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(STICKY_KEY) === "1"; } catch { return false; }
}



export function clearDeviceBlockedSticky() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(STICKY_KEY); } catch { /* ignore */ }
}
