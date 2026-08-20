/**
 * Restrictions service — per-action account restriction system.
 *
 * Backed by public.user_restrictions (see docs/sql/RUN_NOW_user_restrictions.sql).
 * Every protected action MUST call the matching `canX` / `assertCanX` helper
 * BEFORE performing its network operation. When blocked, a global popup is
 * dispatched via the `ddx:restriction-blocked` window event.
 */
import { supabase } from "@/integrations/supabase/client";

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
  starts_at: string;
  expires_at: string | null; // null = permanent
  created_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
}

export type DurationKey = "24h" | "48h" | "72h" | "7d" | "30d" | "permanent";

export const DURATION_LABELS: Record<DurationKey, string> = {
  "24h": "24 giờ",
  "48h": "48 giờ",
  "72h": "72 giờ",
  "7d": "7 ngày",
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
    "24h": 24 * 3600_000,
    "48h": 48 * 3600_000,
    "72h": 72 * 3600_000,
    "7d": 7 * 86400_000,
    "30d": 30 * 86400_000,
  };
  return new Date(now + map[d]).toISOString();
}

/* -----------------------------------------------------------------
 * Cache — one fetch per session; refreshed on demand or after every
 * mutation triggered by admin or auth-state changes.
 * ----------------------------------------------------------------- */
let cache: RestrictionRow[] | null = null;
let inflight: Promise<RestrictionRow[]> | null = null;

function isActive(r: RestrictionRow): boolean {
  if (r.revoked_at) return false;
  if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return false;
  return true;
}

async function loadMine(force = false): Promise<RestrictionRow[]> {
  if (!force && cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return (cache = []);
      const { data, error } = await (supabase.from("user_restrictions") as any)
        .select("id, user_id, kind, reason, starts_at, expires_at, created_by, revoked_at, revoked_by, created_at")
        .eq("user_id", uid)
        .is("revoked_at", null)
        .limit(20);
      if (error) {
        // Table may not exist yet on legacy environments — fail open.
        console.warn("[restrictions] fetch failed:", error.message);
        return (cache = []);
      }
      const rows = ((data ?? []) as RestrictionRow[]).filter(isActive);
      return (cache = rows);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateRestrictionsCache() {
  cache = null;
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
      .select("id, user_id, kind, reason, starts_at, expires_at, created_by, revoked_at, revoked_by, created_at")
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
      .select("id, user_id, kind, reason, starts_at, expires_at, created_by, revoked_at, revoked_by, created_at")
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []) as RestrictionRow[];
  },

  async applyRestriction(input: ApplyRestrictionInput): Promise<RestrictionRow> {
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      user_id: input.userId,
      kind: input.kind,
      reason: input.reason ?? null,
      expires_at: durationToExpiresAt(input.duration),
      created_by: auth.user?.id ?? null,
    };
    // Revoke existing active row of same kind so listing stays clean.
    await (supabase.from("user_restrictions") as any)
      .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user?.id ?? null })
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .is("revoked_at", null);

    const { data, error } = await (supabase.from("user_restrictions") as any)
      .insert([payload])
      .select("id, user_id, kind, reason, starts_at, expires_at, created_by, revoked_at, revoked_by, created_at")
      .single();
    if (error) throw error;
    invalidateRestrictionsCache();
    return data as RestrictionRow;
  },

  async revokeRestriction(id: string): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase.from("user_restrictions") as any)
      .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user?.id ?? null })
      .eq("id", id);
    if (error) throw error;
    invalidateRestrictionsCache();
  },

  async updateDuration(id: string, duration: DurationKey): Promise<void> {
    const { error } = await (supabase.from("user_restrictions") as any)
      .update({ expires_at: durationToExpiresAt(duration) })
      .eq("id", id);
    if (error) throw error;
    invalidateRestrictionsCache();
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