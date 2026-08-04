import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Lightweight per-user cache so feed lists don't hammer the DB.
const cache = new Map<string, { has: boolean; ts: number }>();
const TTL = 60_000;

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
    (async () => {
      const { data } = await supabase
        .from("stories" as any)
        .select("id")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (cancelled) return;
      const value = Array.isArray(data) && data.length > 0;
      cache.set(userId, { has: value, ts: Date.now() });
      setHas(value);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return has;
}
