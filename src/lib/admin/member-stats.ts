/**
 * Thống kê THẬT của thành viên cho trang "Quản lý thành viên".
 *
 * Chỉ ĐỌC dữ liệu đang có:
 *   • Supabase #1 (core): profiles.gem_balance  → số dư Xu thực tế
 *   • Supabase #3 (social): posts, follows      → số bài viết & người theo dõi
 *
 * Không tạo bảng mới, không fake/random, không ghi dữ liệu.
 */
import { supabase, db3 } from "@/lib/db/router";

const sb1 = () => supabase as any;
const sb3 = () => db3() as any;

export type MemberStats = {
  gem: Map<string, number>;
  posts: Map<string, number>;
  followers: Map<string, number>;
};

const emptyStats = (): MemberStats => ({ gem: new Map(), posts: new Map(), followers: new Map() });

/** Số dư xu thực tế (profiles.gem_balance) cho một trang danh sách. */
async function fetchGems(ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  try {
    const { data } = await sb1().from("profiles").select("id, gem_balance").in("id", ids);
    (data ?? []).forEach((r: any) => m.set(String(r.id), Number(r.gem_balance ?? 0)));
  } catch {
    /* RLS / lỗi mạng → để trống, không fake */
  }
  return m;
}

/** Số bài viết thật (posts chưa xoá) — đếm theo user_id trên Supabase #3. */
async function fetchPostCounts(ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  ids.forEach((id) => m.set(id, 0));
  try {
    const { data, error } = await sb3()
      .from("posts")
      .select("user_id, is_deleted")
      .in("user_id", ids)
      .limit(20000);
    if (error) throw error;
    (data ?? []).forEach((r: any) => {
      if (r?.is_deleted) return;
      const k = String(r.user_id);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
  } catch {
    /* giữ 0 thay vì số giả */
  }
  return m;
}

/** Số người theo dõi thật (follows.following_id) trên Supabase #3. */
async function fetchFollowerCounts(ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  ids.forEach((id) => m.set(id, 0));
  try {
    const { data, error } = await sb3()
      .from("follows")
      .select("following_id")
      .in("following_id", ids)
      .limit(50000);
    if (error) throw error;
    (data ?? []).forEach((r: any) => {
      const k = String(r.following_id);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
  } catch {
    /* giữ 0 */
  }
  return m;
}

export async function fetchMemberStats(ids: string[]): Promise<MemberStats> {
  if (!ids.length) return emptyStats();
  const [gem, posts, followers] = await Promise.all([
    fetchGems(ids),
    fetchPostCounts(ids),
    fetchFollowerCounts(ids),
  ]);
  return { gem, posts, followers };
}
