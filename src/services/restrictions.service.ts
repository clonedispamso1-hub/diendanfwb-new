/**
 * Restrictions service — per-action account restriction system.
 *
 * Backed by public.user_restrictions (see docs/sql/RUN_NOW_user_restrictions.sql).
 * Every protected action MUST call the matching `canX` / `assertCanX` helper
 * BEFORE performing its network operation. When blocked, a global popup is
 * dispatched via the `ddx:restriction-blocked` window event.
 */
import { supabase } from "@/lib/db/router";
import { socialDb } from "@/services/database";


export type RestrictionKind =
  | "suspend"
  | "post"
  | "comment"
  | "like"
  | "message"
  | "find_zalo"
  | "avatar_change"
  | "bio_change"
  | "gift"
  | "nearby";

export interface RestrictionRow {
  id: string;
  user_id: string;
  kind: RestrictionKind;
  reason: string | null;
  /** Không tồn tại trên DB hiện tại — suy ra từ created_at. */
  starts_at?: string | null;
  expires_at: string | null; // null = permanent
  created_by: string | null;
  /** DB hiện tại không có cột revoked_* — gỡ hạn chế = xoá dòng. */
  revoked_at?: string | null;
  revoked_by?: string | null;
  created_at: string;
}

export type DurationKey =
  | "1h"
  | "3h"
  | "6h"
  | "12h"
  | "24h"
  | "3d"
  | "7d"
  // Legacy keys (giữ để tương thích dữ liệu / màn hình cũ).
  | "48h"
  | "72h"
  | "30d"
  | "permanent";

/** Bộ thời hạn chuẩn dùng trên mọi UI hạn chế. */
export const RESTRICTION_DURATIONS: DurationKey[] = [
  "1h",
  "3h",
  "6h",
  "12h",
  "24h",
  "3d",
  "7d",
];

export const DURATION_LABELS: Record<DurationKey, string> = {
  "1h": "1 giờ",
  "3h": "3 giờ",
  "6h": "6 giờ",
  "12h": "12 giờ",
  "24h": "24 giờ",
  "3d": "3 ngày",
  "7d": "7 ngày",
  "48h": "48 giờ",
  "72h": "72 giờ",
  "30d": "30 ngày",
  permanent: "Vĩnh viễn",
};

export const KIND_LABELS: Record<RestrictionKind, string> = {
  suspend: "Tạm khoá tài khoản",
  post: "Đăng bài",
  comment: "Bình luận",
  like: "Thả tim",
  message: "Nhắn tin",
  find_zalo: "Tìm Zalo",
  avatar_change: "Đổi avatar",
  bio_change: "Đổi bio",
  gift: "Tặng lì xì",
  nearby: "Tìm quanh đây",
};

export function durationToExpiresAt(d: DurationKey): string | null {
  if (d === "permanent") return null;
  const now = Date.now();
  const map: Record<Exclude<DurationKey, "permanent">, number> = {
    "1h": 3600_000,
    "3h": 3 * 3600_000,
    "6h": 6 * 3600_000,
    "12h": 12 * 3600_000,
    "24h": 24 * 3600_000,
    "3d": 3 * 86400_000,
    "7d": 7 * 86400_000,
    "48h": 48 * 3600_000,
    "72h": 72 * 3600_000,
    "30d": 30 * 86400_000,
  };
  return new Date(now + map[d]).toISOString();
}


/* -----------------------------------------------------------------
 * Cache — one fetch per session; refreshed on demand or after every
 * mutation triggered by admin or auth-state changes.
 * ----------------------------------------------------------------- */
let cache: RestrictionRow[] | null = null;
let cacheAt = 0;
/** Cache rất ngắn: admin áp hạn chế phải có hiệu lực gần như tức thì. */
const CACHE_TTL_MS = 15_000;
let inflight: Promise<RestrictionRow[]> | null = null;


/** Cột THẬT của public.user_restrictions trên Supabase #1. */
const COLS = "id, user_id, kind, reason, expires_at, created_by, created_at";

/** RPC chưa tồn tại trên database (chưa chạy migration). */
function isMissingRpc(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

/** Thông báo rõ ràng khi RLS chặn thao tác trực tiếp. */
function missingRpcHint(error: any): string {
  const msg = String(error?.message ?? error);
  if (msg.toLowerCase().includes("row-level security")) {
    return (
      "Bị RLS chặn. Cần chạy migration " +
      "supabase/sql/RUN_NOW_2026-08-24_user_restrictions_admin_rpc.sql " +
      "(tạo các hàm admin_apply_restriction / admin_revoke_restriction / " +
      "admin_set_restriction_expiry) trên Supabase #1."
    );
  }
  return msg;
}

function isActive(r: RestrictionRow): boolean {
  if (r.revoked_at) return false;
  if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return false;
  return true;
}

/**
 * Hạn chế HẾT HẠN TỰ MỞ: hẹn giờ đúng thời điểm hết hạn gần nhất để xoá
 * cache, lần kiểm tra kế tiếp sẽ thấy user được mở lại (không cần F5).
 */
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutoExpiry(rows: RestrictionRow[]) {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  if (typeof window === "undefined") return;
  const next = rows
    .map((r) => (r.expires_at ? new Date(r.expires_at).getTime() : Infinity))
    .filter((t) => Number.isFinite(t) && t > Date.now())
    .sort((a, b) => a - b)[0];
  if (!next) return;
  const delay = Math.min(Math.max(next - Date.now() + 1000, 1000), 30 * 60_000);
  expiryTimer = setTimeout(() => {
    invalidateRestrictionsCache();
    void loadMine(true);
  }, delay);
}

async function loadMine(force = false): Promise<RestrictionRow[]> {

  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  const store = (rows: RestrictionRow[]) => {
    cache = rows;
    cacheAt = Date.now();
    return rows;
  };
  inflight = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return store([]);
      const { data, error } = await (supabase.from("user_restrictions") as any)
        .select(COLS)
        .eq("user_id", uid)
        .limit(50);
      if (error) {
        // Table may not exist yet on legacy environments — fail open.
        console.warn("[restrictions] fetch failed:", error.message);
        return store([]);
      }
      const rows = ((data ?? []) as RestrictionRow[]).filter(isActive);
      scheduleAutoExpiry(rows);
      return store(rows);


    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateRestrictionsCache() {
  cache = null;
  cacheAt = 0;
}


export async function refreshMyRestrictions() {
  return loadMine(true);
}

export async function listMyRestrictions(): Promise<RestrictionRow[]> {
  return loadMine(false);
}

async function findActive(kind: RestrictionKind): Promise<RestrictionRow | null> {
  const rows = await loadMine();
  // A `suspend` restriction implicitly blocks every other action.
  const suspend = rows.find((r) => r.kind === "suspend");
  if (suspend && kind !== "suspend") return suspend;
  return rows.find((r) => r.kind === kind) ?? null;
}

export interface CanResult {
  ok: boolean;
  restriction?: RestrictionRow;
}

export async function canDo(kind: RestrictionKind): Promise<CanResult> {
  const r = await findActive(kind);
  return r ? { ok: false, restriction: r } : { ok: true };
}

export const canPost = () => canDo("post");
export const canComment = () => canDo("comment");
export const canLike = () => canDo("like");
export const canMessage = () => canDo("message");
export const canFindZalo = () => canDo("find_zalo");
export const isSuspended = () => canDo("suspend").then((r) => !r.ok ? r.restriction! : null);

export class RestrictionError extends Error {
  restriction: RestrictionRow;
  constructor(restriction: RestrictionRow) {
    super(`restricted:${restriction.kind}`);
    this.name = "RestrictionError";
    this.restriction = restriction;
  }
}

/**
 * Assert helper: if restricted, dispatch popup event AND throw.
 * Return `true` to allow, throws `RestrictionError` when blocked.
 * Callers may also do `if (!(await canX()).ok) return` and dispatch manually.
 */
export async function assertCan(kind: RestrictionKind): Promise<true> {
  const { ok, restriction } = await canDo(kind);
  if (ok || !restriction) return true;
  try {
    window.dispatchEvent(
      new CustomEvent("ddx:restriction-blocked", { detail: { restriction, kind } }),
    );
  } catch { /* noop */ }
  throw new RestrictionError(restriction);
}

export const assertCanPost = () => assertCan("post");
export const assertCanComment = () => assertCan("comment");
export const assertCanLike = () => assertCan("like");
export const assertCanMessage = () => assertCan("message");
export const assertCanFindZalo = () => assertCan("find_zalo");

/* -----------------------------------------------------------------
 * Admin API
 * ----------------------------------------------------------------- */
export interface ApplyRestrictionInput {
  userId: string;
  kind: RestrictionKind;
  duration: DurationKey;
  reason?: string;
}

/* -----------------------------------------------------------------
 * Đồng bộ sang Supabase #3 (DB chứa posts / comments / messages).
 * Trigger BEFORE INSERT trên DB #3 mới là lớp enforce thật sự; DB #1
 * chỉ là nguồn quản trị. Nếu migration chưa chạy → cảnh báo, không vỡ.
 * ----------------------------------------------------------------- */
export interface RestrictionSyncResult {
  ok: boolean;
  message?: string;
}

async function syncRestrictionToLogsDb(
  userId: string,
  kind: RestrictionKind,
  reason: string | null,
  expiresAt: string | null,
): Promise<RestrictionSyncResult> {
  try {
    const { error } = await (socialDb() as any).rpc("sync_user_restriction", {
      p_user_id: userId,
      p_kind: kind,
      p_reason: reason,
      p_expires_at: expiresAt,
    });
    if (error) {
      const msg = isMissingRpc(error)
        ? "DB #3 chưa chạy supabase/sql/RUN_NOW_2026-08-25_restrictions_sb3.sql — hạn chế chỉ ghi ở DB #1."
        : error.message;
      console.warn("[restrictions] sync SB3 failed:", msg);
      return { ok: false, message: msg };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn("[restrictions] sync SB3 threw:", e?.message || e);
    return { ok: false, message: e?.message || String(e) };
  }
}

async function clearRestrictionOnLogsDb(
  userId: string,
  kind: RestrictionKind,
): Promise<RestrictionSyncResult> {
  try {
    const { error } = await (socialDb() as any).rpc("clear_user_restriction", {
      p_user_id: userId,
      p_kind: kind,
    });
    if (error) {
      const msg = isMissingRpc(error)
        ? "DB #3 chưa chạy migration hạn chế — chỉ gỡ ở DB #1."
        : error.message;
      console.warn("[restrictions] clear SB3 failed:", msg);
      return { ok: false, message: msg };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}

/** Lấy 1 dòng hạn chế trên DB #1 theo id (để biết user_id + kind khi gỡ). */
async function getRestrictionById(id: string): Promise<RestrictionRow | null> {
  const { data } = await (supabase.from("user_restrictions") as any)
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as RestrictionRow | null;
}

export const restrictionsService = {

  listMyRestrictions,
  refreshMyRestrictions,
  invalidate: invalidateRestrictionsCache,
  canPost,
  canComment,
  canLike,
  canMessage,
  canFindZalo,
  isSuspended,

  async listForUser(
    userId: string,
    scope: "active" | "expired" | "all" = "all",
  ): Promise<RestrictionRow[]> {
    const { data, error } = await (supabase.from("user_restrictions") as any)
      .select(COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = (data ?? []) as RestrictionRow[];
    if (scope === "all") return rows;
    if (scope === "active") return rows.filter(isActive);
    return rows.filter((r) => !isActive(r));
  },

  async listAllActive(): Promise<RestrictionRow[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await (supabase.from("user_restrictions") as any)
      .select(COLS)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as RestrictionRow[];
  },

  /** Đồng bộ 1 hạn chế sang DB #3 (dùng lại ở nơi khác nếu cần). */
  syncToLogsDb: syncRestrictionToLogsDb,
  clearOnLogsDb: clearRestrictionOnLogsDb,

  async applyRestriction(input: ApplyRestrictionInput): Promise<RestrictionRow> {
    const expires = durationToExpiresAt(input.duration);
    const reason = input.reason?.trim() || null;
    let result: RestrictionRow | null = null;

    // Ưu tiên RPC SECURITY DEFINER (kiểm tra _is_current_admin) — RLS của bảng
    // không cho INSERT trực tiếp.
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
      "admin_apply_restriction",
      {
        p_user_id: input.userId,
        p_kind: input.kind,
        p_reason: reason,
        p_expires_at: expires,
      },
    );
    if (!rpcError) {
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      result = (row ?? {
        id: "", user_id: input.userId, kind: input.kind,
        reason, expires_at: expires,
        created_by: null, created_at: new Date().toISOString(),
      }) as RestrictionRow;
    } else {
      if (!isMissingRpc(rpcError)) throw rpcError;

      // Fallback (môi trường cũ chưa chạy migration RPC): thao tác trực tiếp.
      const { data: auth } = await supabase.auth.getUser();
      await (supabase.from("user_restrictions") as any)
        .delete()
        .eq("user_id", input.userId)
        .eq("kind", input.kind);
      const { data, error } = await (supabase.from("user_restrictions") as any)
        .insert([{
          user_id: input.userId,
          kind: input.kind,
          reason,
          expires_at: expires,
          created_by: auth.user?.id ?? null,
        }])
        .select(COLS)
        .single();
      if (error) throw new Error(missingRpcHint(error));
      result = data as RestrictionRow;
    }

    invalidateRestrictionsCache();
    // Enforce thật sự nằm ở DB #3 → luôn đồng bộ sau khi ghi DB #1.
    await syncRestrictionToLogsDb(input.userId, input.kind, reason, expires);
    return result;
  },

  /** Gỡ hạn chế = xoá dòng (schema hiện tại không có cột revoked_at). */
  async revokeRestriction(id: string): Promise<void> {
    const row = await getRestrictionById(id);

    const { error: rpcError } = await (supabase as any).rpc("admin_revoke_restriction", {
      p_id: id,
    });
    if (rpcError) {
      if (!isMissingRpc(rpcError)) throw rpcError;
      const { error } = await (supabase.from("user_restrictions") as any)
        .delete()
        .eq("id", id);
      if (error) throw new Error(missingRpcHint(error));
    }
    invalidateRestrictionsCache();
    if (row) await clearRestrictionOnLogsDb(row.user_id, row.kind);
  },

  async updateDuration(id: string, duration: DurationKey): Promise<void> {
    const expires = durationToExpiresAt(duration);
    const row = await getRestrictionById(id);

    const { error: rpcError } = await (supabase as any).rpc("admin_set_restriction_expiry", {
      p_id: id,
      p_expires_at: expires,
    });
    if (rpcError) {
      if (!isMissingRpc(rpcError)) throw rpcError;
      const { error } = await (supabase.from("user_restrictions") as any)
        .update({ expires_at: expires })
        .eq("id", id);
      if (error) throw new Error(missingRpcHint(error));
    }
    invalidateRestrictionsCache();
    if (row) await syncRestrictionToLogsDb(row.user_id, row.kind, row.reason ?? null, expires);
  },



  /**
   * Permanent ban — locks the account, blacklists device fingerprints,
   * IPs and phone, then kills every active session. Admin-only (enforced
   * server-side by `admin_permanent_ban` via `_is_current_admin`).
   */
  async permanentBan(userId: string, reason?: string): Promise<{
    devices_blocked: number;
    phone_blocked: number;
    phone: string | null;
  }> {
    const { data, error } = await (supabase as any).rpc("admin_permanent_ban", {
      p_user_id: userId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw error;
    invalidateRestrictionsCache();
    return {
      devices_blocked: Number(data?.devices_blocked ?? 0),
      phone_blocked: Number(data?.phone_blocked ?? 0),
      phone: (data?.phone ?? null) as string | null,
    };
  },
};

export type RestrictionsService = typeof restrictionsService;

/**
 * Format the remaining time in a human-friendly Vietnamese string.
 */
export function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "Vĩnh viễn";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Đã hết hạn";
  const days = Math.floor(diff / 86400_000);
  const hours = Math.floor((diff % 86400_000) / 3600_000);
  const mins = Math.floor((diff % 3600_000) / 60_000);
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  return `${mins} phút`;
}