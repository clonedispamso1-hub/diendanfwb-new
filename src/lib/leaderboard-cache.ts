/**
 * leaderboard-cache — mọi nơi trong app dùng chung 1 kết quả bảng xếp hạng.
 *
 * Trước đây header menu, badge provider, rank-glow, top-rank-watcher... mỗi cái
 * tự gọi `leaderboard_follow` / `leaderboard_active_stars_week` mỗi lần render
 * hoặc đổi route → DB bị quá tải. Nay tất cả đi qua cache TTL 5 phút.
 */
import { supabase } from "@/lib/db/router";
import { cachedCall, TTL_MEDIUM } from "@/lib/rpc-cache";
import { fetchWeeklyLeaderboard, type WeeklyLeaderRow } from "@/lib/weekly-leaderboard";

export async function leaderboardFollowToday(force = false): Promise<any[]> {
  return cachedCall(
    "lb:follow:today",
    async () => {
      const { data } = await (supabase as any).rpc("leaderboard_follow", { _period: "today" });
      return Array.isArray(data) ? data : [];
    },
    TTL_MEDIUM,
    force,
  );
}

/**
 * Top tương tác tuần — nguồn duy nhất là SB3 `leaderboard_weekly()`
 * qua fetchWeeklyLeaderboard(). RPC cũ `leaderboard_active_stars_week`
 * đã bị loại bỏ hoàn toàn. Không có dữ liệu ⇒ mảng rỗng (không hàng giả).
 */
export async function weeklyLeaderboardCached(force = false): Promise<WeeklyLeaderRow[]> {
  return cachedCall(
    "lb:weekly",
    async () => {
      try {
        return await fetchWeeklyLeaderboard(50);
      } catch {
        return [];
      }
    },
    TTL_MEDIUM,
    force,
  );
}


/** Bảng xếp hạng theo kỳ khác "today" — vẫn cache nhưng theo key riêng. */
export async function leaderboardFollow(period: string, force = false): Promise<any[]> {
  if (period === "today") return leaderboardFollowToday(force);
  return cachedCall(
    `lb:follow:${period}`,
    async () => {
      const { data } = await (supabase as any).rpc("leaderboard_follow", { _period: period });
      return Array.isArray(data) ? data : [];
    },
    TTL_MEDIUM,
    force,
  );
}

/**
 * Top tương tác TRONG NGÀY — nguồn duy nhất là SB3 `leaderboard_daily()`.
 * Cache TTL trung bình để không gọi lặp mỗi lần render.
 */
export async function dailyLeaderboardCached(force = false) {
  const { fetchDailyLeaderboard } = await import("@/lib/daily-leaderboard");
  return cachedCall(
    "lb:daily",
    async () => {
      try {
        return await fetchDailyLeaderboard(50);
      } catch {
        return [];
      }
    },
    TTL_MEDIUM,
    force,
  );
}
