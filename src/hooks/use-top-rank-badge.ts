/**
 * use-top-rank-badge — chấm đỏ trên nút 3 gạch khi tài khoản lọt Top 10.
 *
 * Quy tắc:
 *  • Lấy hạng từ bảng xếp hạng tuần (cache 5', KHÔNG polling DB).
 *  • rank <= 10 và rank khác hạng đã xem ⇒ hiện chấm đỏ.
 *  • Mở "Bảng xếp hạng" ⇒ markSeen(rank) ⇒ chấm đỏ mất.
 *  • Trạng thái đọc lưu THEO USER: key `toprank.seen.<userId>`.
 */
import { useCallback, useEffect, useState } from "react";
import { weeklyLeaderboardCached } from "@/lib/leaderboard-cache";

const TOP_LIMIT = 10;
const seenKey = (userId: string) => `toprank.seen.${userId}`;

function readSeen(userId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(seenKey(userId));
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function useTopRankBadge(userId?: string | null) {
  const [rank, setRank] = useState<number | null>(null);
  const [seen, setSeen] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setRank(null);
      setSeen(null);
      return;
    }
    let cancelled = false;
    setSeen(readSeen(userId));
    void (async () => {
      try {
        const rows = await weeklyLeaderboardCached();
        if (cancelled) return;
        const idx = (rows as any[]).findIndex((r) => String(r?.user_id) === userId);
        setRank(idx < 0 ? null : idx + 1);
      } catch {
        if (!cancelled) setRank(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(() => {
    if (!userId || rank == null) return;
    try {
      window.localStorage.setItem(seenKey(userId), String(rank));
    } catch {
      /* noop */
    }
    setSeen(rank);
  }, [userId, rank]);

  const show = Boolean(userId) && rank != null && rank <= TOP_LIMIT && rank !== seen;

  return { rank, show, markSeen };
}
