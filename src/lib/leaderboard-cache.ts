/**
 * leaderboard-cache — mọi nơi trong app dùng chung 1 kết quả bảng xếp hạng.
 *
 * Trước đây header menu, badge provider, rank-glow, top-rank-watcher... mỗi cái
 * tự gọi `leaderboard_follow` / `leaderboard_active_stars_week` mỗi lần render
 * hoặc đổi route → DB bị quá tải. Nay tất cả đi qua cache TTL 5 phút.
 */
import { supabase } from "@/integrations/supabase/client";
import { cachedCall, TTL_MEDIUM } from "@/lib/rpc-cache";

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

export async function leaderboardActiveStarsWeek(force = false): Promise<any[]> {
  return cachedCall(
    "lb:stars:week",
    async () => {
      const { data } = await (supabase as any).rpc("leaderboard_active_stars_week");
      return Array.isArray(data) ? data : [];
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
