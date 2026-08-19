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
