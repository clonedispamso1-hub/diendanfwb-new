import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";

export type AdminStatsRange = "today" | "7d" | "30d" | "all";

export const ADMIN_STATS_RANGE_LABEL: Record<AdminStatsRange, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  "30d": "30 ngày",
  all: "Tất cả",
};

export type AdminStatsSummary = {
  posts: number;
  banned: number;
  newToday: number;
  activeNow: number;
};

const sb: any = supabase;

export function adminStatsSinceIso(r: AdminStatsRange): string | null {
  if (r === "all") return null;
  const d = r === "today" ? 1 : r === "7d" ? 7 : 30;
  return new Date(Date.now() - d * 86400_000).toISOString();
}

/** Chỉ tính user thật: bỏ tài khoản clone / nội bộ / admin. */
export function realAdminStatsUserFilter(q: any) {
  return q.or("account_source.is.null,account_source.neq.internal").neq("is_admin", true);
}

/** 00:00 hôm nay (giờ máy admin) dạng ISO. */
export function adminStatsTodayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchAdminStatsSummary(range: AdminStatsRange = "all"): Promise<AdminStatsSummary> {
  const since = adminStatsSinceIso(range);

  let pq = read3().from("posts").select("id", { count: "exact", head: true });
  if (since) pq = pq.gte("created_at", since);

  const bq = realAdminStatsUserFilter(
    sb.from("profiles").select("id", { count: "exact", head: true }),
  ).eq("is_banned", true);

  // Đăng ký mới từ 00:00 hôm nay (chỉ user thật).
  const nq = realAdminStatsUserFilter(
    sb.from("profiles").select("id", { count: "exact", head: true }),
  ).gte("created_at", adminStatsTodayStartIso());

  // Đang hoạt động: online hoặc có hoạt động trong 15 phút gần nhất.
  const aq = realAdminStatsUserFilter(
    sb.from("profiles").select("id", { count: "exact", head: true }),
  ).gte("last_seen", new Date(Date.now() - 15 * 60_000).toISOString());

  const [p, b, n, a] = await Promise.all([pq, bq, nq, aq]);
  return {
    posts: p.count || 0,
    banned: b.count || 0,
    newToday: n.count || 0,
    activeNow: a.count || 0,
  };
}

/** Hàng thành viên dùng cho danh sách chi tiết (cùng nguồn profiles như trang Thành viên). */
export type AdminStatsUserRow = {
  id: string;
  public_id: string | null;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  created_at: string | null;
  last_seen: string | null;
  is_online: boolean | null;
};

const USER_ROW_COLUMNS =
  "id, public_id, full_name, display_name, username, avatar, avatar_url, created_at, last_seen, is_online";

/** Cửa sổ "đang hoạt động" chuẩn (15 phút) và cửa sổ dự phòng (24 giờ). */
export const ADMIN_STATS_ACTIVE_WINDOW_MS = 15 * 60_000;
export const ADMIN_STATS_ACTIVE_FALLBACK_MS = 24 * 60 * 60_000;

export function adminStatsActiveSinceIso(windowMs = ADMIN_STATS_ACTIVE_WINDOW_MS): string {
  return new Date(Date.now() - windowMs).toISOString();
}

function mapRow(raw: any): AdminStatsUserRow {
  return {
    id: String(raw.id),
    public_id: raw.public_id ?? null,
    full_name: raw.full_name ?? raw.display_name ?? null,
    username: raw.username ?? null,
    avatar: raw.avatar ?? raw.avatar_url ?? null,
    created_at: raw.created_at ?? null,
    last_seen: raw.last_seen ?? null,
    is_online: raw.last_seen
      ? Date.now() - new Date(raw.last_seen).getTime() <= ADMIN_STATS_ACTIVE_WINDOW_MS
      : false,
  };
}

/** Thành viên đăng ký mới từ 00:00 hôm nay. */
export async function fetchNewTodayUsers(limit = 50): Promise<AdminStatsUserRow[]> {
  const { data, error } = await realAdminStatsUserFilter(sb.from("profiles").select(USER_ROW_COLUMNS))
    .gte("created_at", adminStatsTodayStartIso())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapRow);
}

/** Thành viên đang hoạt động (mặc định 15 phút gần nhất). */
export async function fetchActiveNowUsers(
  limit = 50,
  windowMs = ADMIN_STATS_ACTIVE_WINDOW_MS,
): Promise<AdminStatsUserRow[]> {
  const { data, error } = await realAdminStatsUserFilter(sb.from("profiles").select(USER_ROW_COLUMNS))
    .gte("last_seen", adminStatsActiveSinceIso(windowMs))
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapRow);
}

/** Số bản ghi mới hơn mốc admin đã xem (dùng cho badge đỏ). */
export async function fetchUnseenCounts(seenNewAtIso: string | null, seenActiveAtIso: string | null) {
  const todayStart = adminStatsTodayStartIso();
  const newSince = seenNewAtIso && seenNewAtIso > todayStart ? seenNewAtIso : todayStart;
  const activeSince = (() => {
    const base = adminStatsActiveSinceIso();
    return seenActiveAtIso && seenActiveAtIso > base ? seenActiveAtIso : base;
  })();

  const nq = realAdminStatsUserFilter(sb.from("profiles").select("id", { count: "exact", head: true })).gt(
    "created_at",
    newSince,
  );
  const aq = realAdminStatsUserFilter(sb.from("profiles").select("id", { count: "exact", head: true })).gt(
    "last_seen",
    activeSince,
  );
  const [n, a] = await Promise.all([nq, aq]);
  return { newUnseen: n.count || 0, activeUnseen: a.count || 0 };
}