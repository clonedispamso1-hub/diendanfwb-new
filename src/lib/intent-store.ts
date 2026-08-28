/**
 * intent-store: cache + realtime cho trường `intent` (Nhu cầu) của profiles.
 *
 * - Một singleton subscribe duy nhất cho mỗi userId được hook đăng ký.
 * - Khi `profiles` thay đổi (UPDATE) hoặc khi local code emit "profile:updated",
 *   tất cả Bubble đang hiển thị được cập nhật ngay lập tức.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";
import { INTENT_OPTIONS, type Intent } from "@/lib/vn-provinces";

type Listener = (value: Intent | null) => void;

const cache = new Map<string, Intent | null>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<void>>();
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function ensureRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel("intent-store:profiles")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      (payload: any) => {
        const row = payload?.new;
        if (!row?.id) return;
        const next = (row.intent ?? null) as Intent | null;
        const prev = cache.get(row.id);
        if (prev === next) return;
        cache.set(row.id, next);
        listeners.get(row.id)?.forEach((cb) => cb(next));
      }
    )
    .subscribe();
}

async function fetchIntent(userId: string) {
  if (inflight.has(userId)) return inflight.get(userId)!;
  const p = (async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("intent")
        .eq("id", userId)
        .maybeSingle();
      const value = (data?.intent ?? null) as Intent | null;
      cache.set(userId, value);
      listeners.get(userId)?.forEach((cb) => cb(value));
    } catch {
      cache.set(userId, null);
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, p);
  return p;
}

export function primeIntent(userId: string, value: Intent | string | null | undefined) {
  if (!userId) return;
  const v = (value ?? null) as Intent | null;
  if (cache.get(userId) === v) return;
  cache.set(userId, v);
  listeners.get(userId)?.forEach((cb) => cb(v));
}

/** Gọi sau khi tự cập nhật profile để Bubble cập nhật ngay (không đợi realtime). */
export function emitIntentChange(userId: string, value: Intent | string | null | undefined) {
  primeIntent(userId, value);
}

export function useUserIntent(
  userId: string | null | undefined,
  initial?: Intent | string | null
): Intent | null {
  const [value, setValue] = useState<Intent | null>(() => {
    if (!userId) return null;
    if (cache.has(userId)) return cache.get(userId) ?? null;
    if (initial !== undefined) return (initial as Intent | null) ?? null;
    return null;
  });

  useEffect(() => {
    if (!userId) return;
    ensureRealtime();

    if (initial !== undefined && !cache.has(userId)) {
      cache.set(userId, (initial as Intent | null) ?? null);
    }

    let set = listeners.get(userId);
    if (!set) {
      set = new Set();
      listeners.set(userId, set);
    }
    const cb: Listener = (v) => setValue(v);
    set.add(cb);

    // Sync initial value from cache
    setValue(cache.get(userId) ?? null);

    if (!cache.has(userId) || cache.get(userId) === null) {
      // Fetch nếu chưa có hoặc null (có thể chưa biết)
      void fetchIntent(userId);
    }

    return () => {
      set!.delete(cb);
      if (set!.size === 0) listeners.delete(userId);
      if (listeners.size === 0 && realtimeChannel) {
        const staleChannel = realtimeChannel;
        realtimeChannel = null;
        void supabase.removeChannel(staleChannel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return value;
}

export function getIntentMeta(intent: Intent | null | undefined) {
  if (!intent) return null;
  return INTENT_OPTIONS.find((o) => o.value === intent) ?? null;
}
