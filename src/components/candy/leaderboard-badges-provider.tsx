import { leaderboardFollowToday, weeklyLeaderboardCached } from "@/lib/leaderboard-cache";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

/**
 * Global "top author" leaderboard cache.
 *
 * Loads the top-10 follow-count and top-10 "rising stars" once, then exposes
 * a lookup that PostCard uses to decorate posts with a rank badge.
 */
type Kind = "follow" | "stars";

interface LeaderboardBadgesValue {
  getRanks: (userId: string | null | undefined) => {
    follow: number | null;
    stars: number | null;
  };
  ready: boolean;
}

const LeaderboardBadgesContext = createContext<LeaderboardBadgesValue>({
  getRanks: () => ({ follow: null, stars: null }),
  ready: false,
});

export function LeaderboardBadgesProvider({ children }: { children: ReactNode }) {
  const [maps, setMaps] = useState<{
    follow: Map<string, number>;
    stars: Map<string, number>;
  }>({ follow: new Map(), stars: new Map() });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const follow = new Map<string, number>();
      const stars = new Map<string, number>();
      try {
        const [fRows, sRows] = await Promise.all([
          leaderboardFollowToday(),
          weeklyLeaderboardCached(),
        ]);
        ((fRows as any[]) || []).slice(0, 10).forEach((r, i) => {
          const uid = r.user_id || r.author_id;
          if (uid) follow.set(uid, i + 1);
        });
        ((sRows as any[]) || []).slice(0, 10).forEach((r, i) => {
          const uid = r.user_id || r.author_id;
          if (uid) stars.set(uid, i + 1);
        });
      } catch {
        /* if RPCs fail, badges just stay absent — never a crash. */
      }
      if (!alive) return;
      setMaps({ follow, stars });
      setReady(true);
    };

    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const value = useMemo<LeaderboardBadgesValue>(
    () => ({
      ready,
      getRanks: (userId) => ({
        follow: userId ? (maps.follow.get(userId) ?? null) : null,
        stars: userId ? (maps.stars.get(userId) ?? null) : null,
      }),
    }),
    [maps, ready],
  );

  return (
    <LeaderboardBadgesContext.Provider value={value}>
      {children}
    </LeaderboardBadgesContext.Provider>
  );
}

export function useLeaderboardRank(userId: string | null | undefined) {
  const { getRanks } = useContext(LeaderboardBadgesContext);
  return getRanks(userId);
}

export const LEADERBOARD_BADGE_KINDS: Kind[] = ["follow", "stars"];
