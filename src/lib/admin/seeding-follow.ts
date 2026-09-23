/**
 * "Theo dõi – Seeding" — clone (tài khoản thứ hai) theo dõi 1 user thật.
 *
 * Tái sử dụng hoàn toàn hệ thống hiện có:
 *   • Quan hệ follow  → bảng `follows` (Supabase #3 — nguồn đọc của app).
 *   • Thông báo       → bảng `notifications` (Supabase #3), kind 'follow_seed'.
 * Dữ liệu MỚI duy nhất của tính năng nằm ở Supabase #4: `seeding_follow_logs`.
 *
 * SQL: supabase-sql/SB3/2026-09-18_admin_seed_follow.sql
 *      supabase-sql/SB4/2026-09-18_seeding_follow_logs.sql
 */
import { db3 } from "@/lib/db/router";
import { sb4Admin } from "@/lib/supabase-v4";

export interface SeedFollowInput {
  cloneId: string;
  cloneUsername?: string | null;
  targetId: string;
  targetUsername?: string | null;
}

export interface SeedFollowResult {
  ok: boolean;
  followed: boolean;
  error?: string;
}

/** Thực hiện 1 lượt seeding follow. */
export async function seedFollow(input: SeedFollowInput): Promise<SeedFollowResult> {
  const { cloneId, targetId } = input;
  if (!cloneId || !targetId) return { ok: false, followed: false, error: "Thiếu tham số" };
  if (cloneId === targetId) return { ok: false, followed: false, error: "Không thể tự theo dõi" };

  // 1) Nguồn đọc chính (#3): follow + notification cho user thật.
  const { data, error } = await (db3() as any).rpc("admin_seed_follow", {
    p_clone_id: cloneId,
    p_target_id: targetId,
  });
  if (error) return { ok: false, followed: false, error: error.message };
  if (data && data.ok === false) {
    return { ok: false, followed: false, error: String(data.error || "Thất bại") };
  }

  // 2) Ghi log ở Supabase #4 (dữ liệu mới của tính năng).
  try {
    await sb4Admin()
      .from("seeding_follow_logs")
      .upsert(
        {
          clone_id: cloneId,
          clone_username: input.cloneUsername ?? null,
          target_id: targetId,
          target_username: input.targetUsername ?? null,
        },
        { onConflict: "clone_id,target_id" },
      );
  } catch {
    /* log không được phép làm hỏng thao tác chính */
  }

  return { ok: true, followed: Boolean(data?.followed) };
}

export interface SeedFollowLog {
  id: string;
  clone_id: string;
  clone_username: string | null;
  target_id: string;
  target_username: string | null;
  created_at: string;
}

/** Lịch sử seeding gần đây (mặc định 30 dòng). */
export async function fetchSeedFollowLogs(limit = 30): Promise<SeedFollowLog[]> {
  try {
    const { data } = await sb4Admin()
      .from("seeding_follow_logs")
      .select("id, clone_id, clone_username, target_id, target_username, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as SeedFollowLog[];
  } catch {
    return [];
  }
}
