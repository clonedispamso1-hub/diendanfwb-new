/**
 * Anti Clone / Spam — DANH SÁCH THÀNH VIÊN THẬT.
 *
 * KHÔNG dùng RPC `admin_member_intel` nữa (RPC này không tồn tại trên Supabase #1
 * → tab luôn lỗi PGRST202). Dữ liệu lấy trực tiếp từ bảng `profiles` giống hệt
 * tab "Danh sách", đã loại clone / bot / internal / seed / virtual.
 *
 * Ba mức xử lý được thực hiện bằng RPC SECURITY DEFINER `admin_anti_clone_purge`
 * (xem supabase/migrations/20260824090000_anti_clone_purge_and_gate.sql).
 */
import { supabase } from "@/lib/db/router";

export interface AntiCloneMember {
  id: string;
  public_id: string | null;
  username: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar: string | null;
  phone: string | null;
  ip: string | null;
  xu: number;
  posts_count: number;
  followers_count: number;
  following_count: number;
  is_banned: boolean;
  ban_level: number;
  is_admin: boolean;
  created_at: string | null;
  last_seen: string | null;
}

export type PurgeLevel = 1 | 2 | 3;

export const PURGE_LEVELS: Record<PurgeLevel, { title: string; desc: string[] }> = {
  1: {
    title: "Mức 1 — Khóa tài khoản",
    desc: [
      "Khóa tài khoản + ép đăng xuất ngay.",
      "Ẩn toàn bộ bài viết (không xóa).",
      "Không xóa tài khoản, có thể mở khóa lại ở tab Đã khóa.",
    ],
  },
  2: {
    title: "Mức 2 — Khóa + Blacklist SĐT",
    desc: [
      "Khóa tài khoản + ép đăng xuất + ẩn bài viết.",
      "Đưa SĐT vào blacklist (không đăng ký mới được).",
      "Không xóa tài khoản, có thể mở khóa lại ở tab Đã khóa.",
    ],
  },
  3: {
    title: "Mức 3 — Cấm toàn bộ",
    desc: [
      "Khóa tài khoản + ép đăng xuất + ẩn bài viết + blacklist SĐT.",
      "Block IP + fingerprint/cookie thiết bị (nếu có dữ liệu thật).",
      "Thiết bị bị chặn truy cập toàn bộ website (Blocked Page).",
      "Không xóa tài khoản — admin vẫn quản lý / mở khóa được.",
    ],
  },
};

const COLS =
  "id, public_id, username, full_name, display_name, avatar, avatar_url, phone, last_ip, " +
  "xu, gems, coins, balance, posts_count, followers_count, following_count, " +
  "is_banned, ban_level, is_admin, created_at, last_seen";

const num = (...v: any[]): number => {
  for (const x of v) if (typeof x === "number" && Number.isFinite(x)) return x;
  return 0;
};

/** Loại tài khoản Admin (bangchu…) khỏi danh sách Anti Clone / Spam. */
function excludeAdmins(q: any): any {
  return q.or("is_admin.is.null,is_admin.eq.false");
}

/** Loại clone / bot / internal / seed / virtual ngay ở tầng query. */
function excludeFake(q: any): any {
  return q
    .or("is_clone.is.null,is_clone.eq.false")
    .or("is_virtual.is.null,is_virtual.eq.false")
    .or("is_seed_account.is.null,is_seed_account.eq.false")
    .or("is_internal.is.null,is_internal.eq.false")
    .or("account_source.is.null,account_source.neq.internal");
}

function mapRow(r: any): AntiCloneMember {
  return {
    id: r.id,
    public_id: r.public_id ?? null,
    username: r.username ?? null,
    full_name: r.full_name ?? null,
    display_name: r.display_name ?? null,
    avatar: r.avatar ?? r.avatar_url ?? null,
    phone: r.phone ?? null,
    ip: r.last_ip ?? null,
    xu: num(r.xu, r.gems, r.coins, r.balance),
    posts_count: num(r.posts_count),
    followers_count: num(r.followers_count),
    following_count: num(r.following_count),
    is_banned: r.is_banned === true,
    ban_level: num(r.ban_level),
    is_admin: r.is_admin === true,
    created_at: r.created_at ?? null,
    last_seen: r.last_seen ?? null,
  };
}

export async function listAntiCloneMembers(params: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AntiCloneMember[]; total: number }> {
  const limit = params.limit ?? 30;
  const offset = params.offset ?? 0;
  const term = params.q?.trim();

  const build = (withFilter: boolean) => {
    let q = excludeAdmins((supabase.from("profiles") as any).select(COLS, { count: "exact" }));
    if (withFilter) q = excludeFake(q);
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `username.ilike.${like},full_name.ilike.${like},display_name.ilike.${like},phone.ilike.${like},public_id.ilike.${like}`,
      );
    }
    return q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  };

  let res = await build(true);
  // Cột lọc không tồn tại trên DB → thử lại không lọc, không để vỡ tab.
  if (res.error) res = await build(false);
  if (res.error) throw res.error;

  // Chốt chặn cuối: Admin không bao giờ xuất hiện trong Anti Clone / Spam.
  const rows = ((res.data ?? []) as any[]).map(mapRow).filter((r) => !r.is_admin);
  const removed = (res.data?.length ?? 0) - rows.length;
  const total = res.count ?? rows.length;

  return { rows, total: Math.max(total - removed, rows.length) };
}

export interface PurgeResult {
  ok: boolean;
  level: number;
  deleted: boolean;
  phone_blacklisted: boolean;
  ip_blocked: boolean;
  device_blocked: boolean;
}

/** true nếu lỗi là "RPC/bảng chưa tồn tại" (chưa chạy migration). */
export function isMissingObject(err: any): boolean {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? "");
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    /Could not find the (function|table)/i.test(msg)
  );
}

export const MISSING_MIGRATION_MSG =
  "Database thiếu RPC admin_anti_clone_purge. Hãy chạy migration " +
  "supabase/migrations/20260824090000_anti_clone_purge_and_gate.sql trên Supabase #1.";

export async function purgeMember(input: {
  userId: string;
  level: PurgeLevel;
  reason?: string | null;
  ip?: string | null;
  fingerprint?: string | null;
  cookieId?: string | null;
}): Promise<PurgeResult> {
  const { data, error } = await (supabase as any).rpc("admin_anti_clone_purge", {
    p_user: input.userId,
    p_level: input.level,
    p_reason: input.reason ?? null,
    p_ip: input.ip ?? null,
    p_fingerprint: input.fingerprint ?? null,
    p_cookie: input.cookieId ?? null,
  });
  if (error) {
    if (isMissingObject(error)) throw new Error(MISSING_MIGRATION_MSG);
    throw error;
  }
  return data as PurgeResult;
}

/* ------------------------------------------------------------------ */
/* Tab "Đã khóa" — danh sách tài khoản đang bị khóa + gỡ khóa         */
/* ------------------------------------------------------------------ */

export interface LockedMember {
  id: string;
  public_id: string | null;
  username: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar: string | null;
  phone: string | null;
  ip: string | null;
  xu: number;
  posts_count: number;
  ban_level: number;
  ban_reason: string | null;
  banned_at: string | null;
}

const LOCKED_COLS =
  "id, public_id, username, full_name, display_name, avatar, avatar_url, phone, last_ip, " +
  "xu, gems, coins, balance, posts_count, " +
  "ban_level, ban_reason, banned_at, updated_at, created_at";

function mapLocked(r: any): LockedMember {
  return {
    id: r.id,
    public_id: r.public_id ?? null,
    username: r.username ?? null,
    full_name: r.full_name ?? null,
    display_name: r.display_name ?? null,
    avatar: r.avatar ?? r.avatar_url ?? null,
    phone: r.phone ?? null,
    ip: r.last_ip ?? null,
    xu: num(r.xu, r.gems, r.coins, r.balance),
    posts_count: num(r.posts_count),
    ban_level: num(r.ban_level),
    ban_reason: r.ban_reason ?? null,
    banned_at: r.banned_at ?? r.updated_at ?? null,
  };
}


/** Danh sách tài khoản đang bị khóa (is_banned = true), mới nhất trước. */
export async function listLockedMembers(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: LockedMember[]; total: number }> {
  const limit = params?.limit ?? 30;
  const offset = params?.offset ?? 0;
  const term = params?.q?.trim();

  const build = (cols: string, withBannedAt: boolean) => {
    let q = (supabase.from("profiles") as any)
      .select(cols, { count: "exact" })
      .eq("is_banned", true);
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `username.ilike.${like},full_name.ilike.${like},display_name.ilike.${like},phone.ilike.${like},public_id.ilike.${like}`,
      );
    }
    return q
      .order(withBannedAt ? "banned_at" : "created_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
  };

  let res = await build(LOCKED_COLS, true);
  // DB thiếu cột banned_at / ban_reason → fallback tối thiểu, không để vỡ tab.
  if (res.error) {
    res = await build(
      "id, public_id, username, full_name, display_name, avatar, avatar_url, phone, ban_level, created_at",
      false,
    );
  }
  if (res.error) throw res.error;

  return {
    rows: ((res.data ?? []) as any[]).map(mapLocked),
    total: res.count ?? (res.data?.length ?? 0),
  };
}

export const MISSING_RESTORE_MSG =
  "Database thiếu RPC admin_anti_clone_restore. Hãy chạy migration " +
  "supabase-sql/pending/2026-08-24_anti_clone_purge_and_gate.sql trên Supabase #1.";

/** Gỡ khóa hoàn toàn (đối xứng với purge) — dùng RPC hiện có, không tạo SQL mới. */
export async function restoreMember(userId: string): Promise<{ ok: boolean }> {
  const { data, error } = await (supabase as any).rpc("admin_anti_clone_restore", {
    p_user: userId,
  });
  if (error) {
    if (isMissingObject(error)) throw new Error(MISSING_RESTORE_MSG);
    throw error;
  }
  return (data as { ok: boolean }) ?? { ok: true };
}
