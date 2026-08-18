/**
 * Badge "người theo dõi mới" (kiểu Messenger/Facebook).
 *
 * - Chỉ đếm follower có `created_at` trong 24 giờ gần nhất VÀ sau lần cuối
 *   người dùng mở danh sách Followers.
 * - KHÔNG polling: 1 lần đọc khi mount + realtime INSERT/DELETE trên `follows`
 *   lọc theo `following_id = me`.
 * - Không thêm bảng mới, chỉ tận dụng dữ liệu follow hiện có.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEEN_KEY = "nfwb:followers-seen-at";
export const NEW_FOLLOWERS_EVENT = "nfwb:new-followers-seen";

/** Mốc thời gian follower được coi là "mới" (NEW trong danh sách). */
export function isNewFollower(followedAt?: string | null): boolean {
  if (!followedAt) return false;
  const t = Date.parse(followedAt);
  return Number.isFinite(t) && Date.now() - t < DAY_MS;
}

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.localStorage.getItem(SEEN_KEY) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

/** Gọi khi user mở danh sách Followers → badge biến mất. */
export function markFollowersSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(NEW_FOLLOWERS_EVENT));
}

async function countNewFollowers(meId: string): Promise<number> {
  const since = new Date(Math.max(Date.now() - DAY_MS, readSeenAt())).toISOString();
  const { count, error } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", meId)
    .gt("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Số người theo dõi mới (24h, chưa xem). Trả về 0 khi chưa đăng nhập.
 */
export function useNewFollowerCount(meId: string | null | undefined): number {
  const [count, setCount] = useState(0);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!meId) {
      setCount(0);
      return;
    }
    const n = await countNewFollowers(meId);
    if (aliveRef.current) setCount(n);
  }, [meId]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();

    const onSeen = () => setCount(0);
    window.addEventListener(NEW_FOLLOWERS_EVENT, onSeen);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (meId) {
      channel = supabase
        .channel(`new-followers-${meId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "follows", filter: `following_id=eq.${meId}` },
          () => setCount((c) => c + 1),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "follows", filter: `following_id=eq.${meId}` },
          () => void refresh(),
        )
        .subscribe();
    }

    return () => {
      aliveRef.current = false;
      window.removeEventListener(NEW_FOLLOWERS_EVENT, onSeen);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [meId, refresh]);

  return count;
}
