/**
 * Rank Glow store (Task #4.7)
 * -------------------------------------------------------------
 * Fetches the current Top Follow #1 and Top Rising Stars #1/#2/#3
 * once per app session (with a light TTL refresh) so any avatar
 * anywhere in the app can render the right glow color WITHOUT
 * touching business logic (DB / RPC / Wallet / Notification / …).
 *
 * Priority (highest → lowest):
 *   🟡 follow1   — Top Follow #1  (today)
 *   🟣 rising1   — Top Rising Star #1 (week)
 *   🔴 rising2   — Top Rising Star #2 (week)
 *   🟢 rising3   — Top Rising Star #3 (week)
 *   ⚪ default   — all other members (soft white glow)
 *
 * Read-only against existing RPCs `leaderboard_follow` and
 * `leaderboard_active_stars_week` that already power RankingModal.
 */
import { leaderboardFollowToday, leaderboardActiveStarsWeek } from "@/lib/leaderboard-cache";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

export type RankTier = "follow1" | "follow2" | "follow3" | "rising1" | null;

interface RankState {
  followTop1: string | null;
  followTop2: string | null;
  followTop3: string | null;
  risingTop1: string | null;
  loadedAt: number;
}

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

let state: RankState = {
  followTop1: null,
  followTop2: null,
  followTop3: null,
  risingTop1: null,
  loadedAt: 0,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

let inflight: Promise<void> | null = null;
async function refresh(force = false): Promise<void> {
  const fresh = Date.now() - state.loadedAt < REFRESH_MS;
  if (!force && fresh) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [followRows, risingRows] = await Promise.all([
        leaderboardFollowToday(force),
        leaderboardActiveStarsWeek(force),
      ]);
      const pickId = (r: any): string | null =>
        r?.user_id ?? r?.id ?? r?.profile_id ?? null;
      state = {
        followTop1: pickId(followRows[0]),
        followTop2: pickId(followRows[1]),
        followTop3: pickId(followRows[2]),
        risingTop1: pickId(risingRows[0]),
        loadedAt: Date.now(),
      };
      emit();
    } catch (err) {
      // Silent: glow degrades to default white.
      if (typeof console !== "undefined") {
        console.warn("[rank-glow] refresh failed", err);
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function getSnapshot(): RankState {
  return state;
}
function getServerSnapshot(): RankState {
  return state;
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Lazy-load on first subscriber and periodically thereafter.
  void refresh();
  return () => {
    listeners.delete(cb);
  };
}

/** Resolve the glow tier for a given userId based on current cached ranks. */
export function resolveRankTier(userId?: string | null, s: RankState = state): RankTier {
  if (!userId) return null;
  if (s.followTop1 && s.followTop1 === userId) return "follow1";
  if (s.followTop2 && s.followTop2 === userId) return "follow2";
  if (s.followTop3 && s.followTop3 === userId) return "follow3";
  if (s.risingTop1 && s.risingTop1 === userId) return "rising1";
  return null;
}

/** React hook — returns the glow tier for the given userId. */
export function useRankTier(userId?: string | null): RankTier {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return resolveRankTier(userId, snap);
}

/** Manual trigger (rarely needed — subscribe already loads on mount). */
export function primeRankGlow(): void {
  void refresh(true);
}
