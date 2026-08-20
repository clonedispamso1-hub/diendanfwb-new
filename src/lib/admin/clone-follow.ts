// Theo Dõi Thành Viên — hàng đợi Follow chạy 100% trong PostgreSQL (pg_cron).
// Frontend chỉ gọi RPC, KHÔNG có timer: đóng website hàng đợi vẫn chạy.
// SQL: docs/sql/RUN_NOW_2026-08-19_CLONE_FOLLOW_QUEUE.sql
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type FollowUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  gender: string | null;
  followers: number;
  created_at: string;
};

export type FollowTask = {
  task_id: string;
  follower_id: string;
  follower_username: string | null;
  follower_avatar: string | null;
  target_id: string;
  target_username: string | null;
  target_avatar: string | null;
  run_at: string;
  status: string;
  error: string | null;
};

/** Danh sách người dùng THẬT (không phải clone) để chọn theo dõi. */
export async function followUserList(q = "", limit = 500): Promise<FollowUser[]> {
  const { data, error } = await sb.rpc("admin_follow_user_list", {
    p_q: q.trim() || null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as FollowUser[];
}

/* ------------------------------------------------------------------ *
 * Bộ lọc theo thời gian đăng ký + phân trang (lọc & cắt trang DƯỚI DB)
 * ------------------------------------------------------------------ */
export type MemberRange = "today" | "yesterday" | "day_before" | "this_week" | "latest";

export const MEMBER_RANGE_LABEL: Record<MemberRange, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  day_before: "Hôm kia",
  this_week: "Tuần này (T2 - T7)",
  latest: "Mới nhất",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Khoảng [from, to) theo giờ máy admin. `latest` = không giới hạn thời gian. */
export function memberRangeBounds(range: MemberRange): { from?: string; to?: string } {
  const today = startOfDay(new Date());
  const day = 86_400_000;
  if (range === "latest") return {};
  if (range === "today") return { from: today.toISOString() };
  if (range === "yesterday")
    return {
      from: new Date(today.getTime() - day).toISOString(),
      to: today.toISOString(),
    };
  if (range === "day_before")
    return {
      from: new Date(today.getTime() - 2 * day).toISOString(),
      to: new Date(today.getTime() - day).toISOString(),
    };
  // this_week: Thứ 2 → hết Thứ 7 của tuần hiện tại
  const dow = today.getDay(); // 0 = CN
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today.getTime() - backToMonday * day);
  return {
    from: monday.toISOString(),
    to: new Date(monday.getTime() + 6 * day).toISOString(),
  };
}

export type MemberPage = {
  rows: FollowUser[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Trang danh sách thành viên — CHỈ select cột cần thiết, lọc `created_at`
 * và phân trang ngay dưới Supabase (KHÔNG kéo cả bảng profiles về client).
 */
export async function followUserPage(opts: {
  q?: string;
  range?: MemberRange;
  page?: number;
  pageSize?: number;
}): Promise<MemberPage> {
  const page = Math.max(0, opts.page ?? 0);
  const pageSize = Math.min(50, Math.max(10, opts.pageSize ?? 20));
  const { from, to } = memberRangeBounds(opts.range ?? "latest");
  const q = (opts.q ?? "").trim();

  let query = sb
    .from("profiles")
    .select("id, username, full_name, avatar, created_at", { count: "exact" })
    .or("account_source.is.null,account_source.neq.internal")
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);
  if (q) query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows: FollowUser[] = (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.username ?? null,
    full_name: r.full_name ?? null,
    avatar: r.avatar ?? null,
    gender: null,
    followers: 0,
    created_at: r.created_at,
  }));

  return { rows, total: count ?? rows.length, page, pageSize };
}

/** Sinh hàng đợi Follow. Trả về số task đã tạo. */
export async function followApply(input: {
  cloneIds?: string[];
  userIds: string[];
  perUser?: number;
  delayMin?: number;
  delayMax?: number;
}): Promise<number> {
  const { data, error } = await sb.rpc("admin_clone_follow_apply", {
    p_clone_ids: input.cloneIds ?? [],
    p_user_ids: input.userIds,
    p_per_user: input.perUser ?? 10,
    p_delay_min: input.delayMin ?? 0,
    p_delay_max: input.delayMax ?? 60,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

export async function followTasks(limit = 500): Promise<FollowTask[]> {
  const { data, error } = await sb.rpc("admin_clone_follow_tasks", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as FollowTask[];
}

export async function followClear(): Promise<number> {
  const { data, error } = await sb.rpc("admin_clone_follow_clear");
  if (error) throw error;
  return (data ?? 0) as number;
}

export const FOLLOW_STATUS_LABEL: Record<string, string> = {
  pending: "Đang chờ",
  done: "Đã xong",
  skipped: "Bỏ qua",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};
