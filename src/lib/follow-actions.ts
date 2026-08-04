// Centralized follow/unfollow with notification dedup + global realtime sync.
//
// Server-side (see docs/sql/2026-07-06_follow_realtime_fix.sql):
//   - trigger AFTER INSERT ON follows  -> creates deduped "follow" notification
//   - trigger AFTER DELETE ON follows  -> removes the matching notification
//   - follows + notifications are added to supabase_realtime publication
//
// Client-side (this file):
//   - followUser / unfollowUser only touch the `follows` table; the trigger
//     handles the notification, so RLS never silently swallows the write.
//   - a single global Postgres realtime channel subscribes to `follows`
//     INSERT/DELETE and re-broadcasts the change through the same
//     `nfwb:follow-change` window event that every UI hook already listens to.
//   - useIsFollowing() stays as the single source of truth per targetId.

import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { guardAction } from "@/lib/rate-limit";

/**
 * Follow/unfollow uses the global rate-limit system (see src/lib/rate-limit.ts
 * and docs/sql/2026-07-19_global_rate_limiting.sql).
 * Default: 10 follow actions / 60 seconds. Backend is the source of truth.
 *
 * Returns true when the action is allowed to proceed. When false, a toast has
 * already been shown; callers should silently abort.
 */
async function assertFollowRateLimit(): Promise<boolean> {
  return guardAction("follow");
}
function markFollowAction(_meId: string): void {
  // No-op: rate limit is enforced by guardAction() + DB.
}

const FOLLOW_EVENT = "nfwb:follow-change";
const cache: Map<string, boolean> = new Map();

/**
 * Per-viewer follow set. Keyed by `${meId}:${targetId}` so switching account
 * in the same tab doesn't leak cached state.
 */
function cacheKey(meId: string | null | undefined, targetId: string): string {
  return `${meId ?? "_"}::${targetId}`;
}

function broadcast(
  meId: string | null | undefined,
  targetId: string,
  following: boolean,
) {
  cache.set(cacheKey(meId, targetId), following);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FOLLOW_EVENT, {
      detail: { targetId, following, actorId: meId ?? null },
    }),
  );
}

/**
 * Translate PostgREST/Supabase errors to friendly Vietnamese messages so the
 * UI never shows raw SQL errors (RLS, permission, network…) to end users.
 */
function toFriendlyFollowError(error: any): Error {
  const rawMsg = `${error?.message ?? ""}`;
  const msg = rawMsg.toLowerCase();
  const code = String(error?.code ?? "");

  // Session / auth issues
  if (
    code === "401" || code === "PGRST301" || code === "PGRST302" ||
    msg.includes("jwt") || msg.includes("not authenticated") ||
    msg.includes("no authorization") || msg.includes("invalid api key")
  ) {
    return new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  // RLS / permission
  if (
    code === "42501" || code === "PGRST116" ||
    msg.includes("row-level security") || msg.includes("row level security") ||
    msg.includes("permission denied") || msg.includes("violates")
  ) {
    return new Error("Bạn cần đăng nhập để sử dụng tính năng này.");
  }
  // Network / offline
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return new Error("Kết nối mạng không ổn định. Vui lòng thử lại.");
  }
  // Trigger-side crashes (e.g. handle_follow_insert throwing on bad JSONB).
  // Surface the real DB message so we can trace tận gốc thay vì nuốt lỗi.
  if (rawMsg) {
    return new Error(`Không thể yêu thích: ${rawMsg}`);
  }
  return new Error("Không thể thực hiện thao tác. Vui lòng thử lại.");
}

/** Insert follow row. Notification is created by the DB trigger. */
export async function followUser(meId: string, targetId: string): Promise<void> {
  if (!meId || !targetId || meId === targetId) return;
  if (!(await assertFollowRateLimit())) return;
  const { error } = await supabase
    .from("follows")
    .insert([{ follower_id: meId, following_id: targetId }]);
  if (error) {
    const msg = `${error.message ?? ""}`.toLowerCase();
    if (msg.includes("duplicate") || (error as any).code === "23505") {
      markFollowAction(meId);
      broadcast(meId, targetId, true);
      return;
    }
    console.warn("[follow] insert error:", error);
    throw toFriendlyFollowError(error);
  }
  markFollowAction(meId);
  broadcast(meId, targetId, true);
}

/** Delete follow row. Notification cleanup handled by the DB trigger. */
export async function unfollowUser(meId: string, targetId: string): Promise<void> {
  if (!meId || !targetId) return;
  if (!(await assertFollowRateLimit())) return;
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", meId)
    .eq("following_id", targetId);
  if (error) {
    console.warn("[unfollow] delete error:", error);
    throw toFriendlyFollowError(error);
  }
  markFollowAction(meId);
  broadcast(meId, targetId, false);
}

/** Toggle used by "+" buttons. Returns the new state. */
export async function toggleFollow(
  meId: string,
  targetId: string,
  currentlyFollowing: boolean,
): Promise<boolean> {
  if (currentlyFollowing) {
    await unfollowUser(meId, targetId);
    return false;
  }
  await followUser(meId, targetId);
  return true;
}

/** Legacy hook for call sites that already wrote to DB directly. */
export function announceFollowChange(targetId: string, following: boolean): void {
  broadcast(null, targetId, following);
}

/** Subscribe to follow-change events (window custom event, all tabs). */
export function subscribeFollowChange(
  cb: (detail: { targetId: string; following: boolean; actorId: string | null }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d && typeof d.targetId === "string") cb(d);
  };
  window.addEventListener(FOLLOW_EVENT, handler as EventListener);
  return () => window.removeEventListener(FOLLOW_EVENT, handler as EventListener);
}

// ---------------------------------------------------------------------
// Global Postgres realtime bridge.
// ONE channel per browser session. On any follows insert/delete anywhere
// in the DB we broadcast a follow-change event so every component that
// uses useIsFollowing / subscribeFollowChange updates instantly.
// ---------------------------------------------------------------------
let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  try {
    const channel = supabase
      .channel("nfwb-follows-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "follows" },
        (payload) => {
          const row = payload.new as {
            follower_id: string;
            following_id: string;
          };
          if (!row?.follower_id || !row?.following_id) return;
          broadcast(row.follower_id, row.following_id, true);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "follows" },
        (payload) => {
          const row = payload.old as {
            follower_id: string;
            following_id: string;
          };
          if (!row?.follower_id || !row?.following_id) return;
          broadcast(row.follower_id, row.following_id, false);
        },
      )
      .subscribe();
    // Best-effort cleanup on unload.
    window.addEventListener("beforeunload", () => {
      try {
        supabase.removeChannel(channel);
      } catch { /* ignore */ }
    });
  } catch {
    // Realtime unavailable -> silently fall back to local events.
    realtimeStarted = false;
  }
}

/** React hook — single source of truth for the follow state of `targetId`. */
export function useIsFollowing(
  meId: string | null | undefined,
  targetId: string | null | undefined,
  initial?: boolean,
): [boolean, (v: boolean) => void] {
  const [state, setState] = useState<boolean>(() => {
    if (!targetId) return false;
    const k = cacheKey(meId, targetId);
    if (cache.has(k)) return cache.get(k)!;
    return Boolean(initial);
  });

  // Start global realtime once per app lifetime.
  useEffect(() => { ensureRealtime(); }, []);

  // Hydrate from DB once.
  useEffect(() => {
    let cancelled = false;
    if (!meId || !targetId || meId === targetId) return;
    const k = cacheKey(meId, targetId);
    if (cache.has(k)) {
      setState(cache.get(k)!);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", meId)
        .eq("following_id", targetId)
        .maybeSingle();
      if (cancelled) return;
      const v = Boolean(data);
      cache.set(k, v);
      setState(v);
    })();
    return () => { cancelled = true; };
  }, [meId, targetId]);

  // Sync from global broadcasts (both same-tab actions and Postgres realtime).
  useEffect(() => {
    if (!targetId) return;
    return subscribeFollowChange((d) => {
      if (d.targetId !== targetId) return;
      // Only apply broadcasts that concern the current viewer.
      // actorId===null means "unknown" (legacy) – still apply for safety.
      if (d.actorId && meId && d.actorId !== meId) return;
      setState(d.following);
    });
  }, [meId, targetId]);

  const setBoth = (v: boolean) => {
    if (targetId) cache.set(cacheKey(meId, targetId), v);
    setState(v);
  };

  return [state, setBoth];
}

// ---------------------------------------------------------------------
// FIX BUG TIM: nguồn sự thật duy nhất là DB.
// - Không bao giờ count++/count-- ở frontend.
// - Mỗi cặp (follower_id, following_id) chỉ tồn tại đúng 1 record
//   (UNIQUE constraint ở DB; ở client insert trùng được coi là thành công).
// ---------------------------------------------------------------------

/** Trạng thái thật trong DB: user này đã thả tim target chưa? */
export async function hasHeart(meId: string, targetId: string): Promise<boolean> {
  if (!meId || !targetId) return false;
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", meId)
    .eq("following_id", targetId)
    .maybeSingle();
  const v = Boolean(data);
  cache.set(cacheKey(meId, targetId), v);
  return v;
}

/**
 * Đặt trạng thái tim một cách idempotent (không toggle "mù").
 * Trả về trạng thái THẬT sau khi ghi — UI chỉ hiển thị theo giá trị này.
 */
export async function setProfileHeart(
  meId: string,
  targetId: string,
  next: boolean,
): Promise<boolean> {
  if (!meId || !targetId || meId === targetId) return false;
  if (!(await assertFollowRateLimit())) return hasHeart(meId, targetId);

  if (next) {
    const { error } = await supabase
      .from("follows")
      .insert([{ follower_id: meId, following_id: targetId }]);
    if (error) {
      const msg = `${error.message ?? ""}`.toLowerCase();
      const dup = msg.includes("duplicate") || String((error as any).code) === "23505";
      if (!dup) throw toFriendlyFollowError(error);
    }
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", meId)
      .eq("following_id", targetId);
    if (error) throw toFriendlyFollowError(error);
  }

  const v = await hasHeart(meId, targetId);
  broadcast(meId, targetId, v);
  return v;
}
