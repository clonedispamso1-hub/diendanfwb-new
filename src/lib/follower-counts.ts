/**
 * follower-counts — đếm số người đang Follow một tài khoản, lấy TRỰC TIẾP từ
 * bảng `follows` (Supabase #3) thay vì cột `profiles.followers_count` (đã lỗi
 * thời sau khi follows được chuyển sang #3).
 *
 * Chỉ đọc — không thay đổi logic follow/unfollow.
 */
import { read3 } from "@/lib/content-db";

const TTL = 30_000;
const cache = new Map<string, { at: number; value: number }>();

/** Trả về Map<userId, số người theo dõi> cho danh sách id truyền vào. */
export async function fetchFollowerCounts(userIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, number>();
  const now = Date.now();

  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL) out.set(id, hit.value);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  // Một truy vấn duy nhất cho cả danh sách, rồi tự gom nhóm phía client.
  const { data, error } = await read3()
    .from("follows")
    .select("following_id")
    .in("following_id", missing)
    .limit(100_000);

  if (error) {
    console.error("fetchFollowerCounts error:", error.message);
    missing.forEach((id) => out.set(id, out.get(id) ?? 0));
    return out;
  }

  const tally = new Map<string, number>();
  missing.forEach((id) => tally.set(id, 0));
  for (const row of (data as { following_id: string }[]) || []) {
    const key = String(row.following_id);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  for (const [id, count] of tally) {
    cache.set(id, { at: now, value: count });
    out.set(id, count);
  }
  return out;
}
