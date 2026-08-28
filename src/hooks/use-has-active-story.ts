import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * "User này có story đang chạy không?"
 *
 * Chống N+1: các card trong cùng một tick React được GỘP lại thành MỘT query
 * `in(user_id, [...])` thay vì mỗi card một query. Kết quả cache 60s.
 */
const cache = new Map<string, { has: boolean; ts: number }>();
const TTL = 60_000;

let pending = new Set<string>();
let waiters: Array<() => void> = [];
let scheduled = false;

function flush() {
  const ids = [...pending];
  const cbs = waiters;
  pending = new Set();
  waiters = [];
  scheduled = false;
  if (ids.length === 0) return;
  void (async () => {
    const { data } = await supabase
      .from("stories" as any)
      .select("user_id")
      .in("user_id", ids)
      .gt("expires_at", new Date().toISOString());
    const active = new Set<string>(((data as any[]) || []).map((r) => r.user_id));
    const ts = Date.now();
    ids.forEach((id) => cache.set(id, { has: active.has(id), ts }));
    cbs.forEach((cb) => cb());
  })();
}

function queue(userId: string, cb: () => void) {
  pending.add(userId);
  waiters.push(cb);
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, 250);
  }
}

export function useHasActiveStory(userId?: string | null): boolean {
  const [has, setHas] = useState<boolean>(() => {
    if (!userId) return false;
    const c = cache.get(userId);
    return c ? c.has : false;
  });

  useEffect(() => {
    if (!userId) { setHas(false); return; }
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.ts < TTL) { setHas(cached.has); return; }
    let cancelled = false;
    queue(userId, () => {
      if (cancelled) return;
      setHas(cache.get(userId)?.has ?? false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return has;
}


/** Nạp sẵn trạng thái story cho nhiều user (gọi 1 lần mỗi trang feed). */
export async function prefetchActiveStories(userIds: Array<string | null | undefined>) {
  const now = Date.now();
  const ids = [...new Set(userIds.filter((id): id is string => !!id))].filter((id) => {
    const c = cache.get(id);
    return !(c && now - c.ts < TTL);
  });
  if (!ids.length) return;
  const { data } = await supabase
    .from("stories" as any)
    .select("user_id")
    .in("user_id", ids)
    .gt("expires_at", new Date().toISOString());
  const active = new Set<string>(((data as any[]) || []).map((r) => r.user_id));
  const ts = Date.now();
  ids.forEach((id) => cache.set(id, { has: active.has(id), ts }));
}
