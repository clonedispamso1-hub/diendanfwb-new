/**
 * Global notification realtime bus.
 *
 * Rules enforced:
 *  - Only ONE realtime channel per app for notification-related tables.
 *  - All `.on("postgres_changes", ...)` handlers are registered BEFORE
 *    `.subscribe()` (Supabase v2 forbids registering callbacks after
 *    subscribe → "cannot add 'postgres_changes' callbacks after subscribe()").
 *  - Consumers register lightweight listener callbacks; the channel is
 *    created lazily on the first listener and torn down when the last
 *    listener unregisters (reference-counted).
 *  - When the current user changes, we tear down and rebuild the channel.
 *  - No duplicate channels are ever created.
 */
import { supabase } from "@/integrations/supabase/client";

type Payload = any;
type Listener = (payload: Payload) => void;

type BucketKey = "notifications" | "gem_transactions";

const listeners: Record<BucketKey, Set<Listener>> = {
  notifications: new Set(),
  gem_transactions: new Set(),
};

let currentUserId: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;

function totalListeners(): number {
  return listeners.notifications.size + listeners.gem_transactions.size;
}

function teardown() {
  if (channel) {
    try { void supabase.removeChannel(channel); } catch { /* noop */ }
  }
  channel = null;
  currentUserId = null;
}

function ensureChannel(userId: string) {
  if (channel && currentUserId === userId) return;
  // User changed OR no channel yet → rebuild from scratch.
  teardown();
  currentUserId = userId;
  const ch = supabase.channel(`app-notif-${userId}`);

  // IMPORTANT: register all `.on()` handlers BEFORE `.subscribe()`.
  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
    (payload: Payload) => {
      for (const cb of listeners.notifications) {
        try { cb(payload); } catch (err) { console.error("[notif-rt] listener error", err); }
      }
    },
  );
  ch.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "gem_transactions", filter: `to_id=eq.${userId}` },
    (payload: Payload) => {
      for (const cb of listeners.gem_transactions) {
        try { cb(payload); } catch (err) { console.error("[gem-rt] listener error", err); }
      }
    },
  );

  ch.subscribe();
  channel = ch;
}

function register(bucket: BucketKey, userId: string | null | undefined, cb: Listener): () => void {
  if (!userId) return () => {};
  listeners[bucket].add(cb);
  ensureChannel(userId);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    listeners[bucket].delete(cb);
    if (totalListeners() === 0) teardown();
  };
}

export function onNotificationEvent(userId: string | null | undefined, cb: Listener) {
  return register("notifications", userId, cb);
}

export function onGemTransactionEvent(userId: string | null | undefined, cb: Listener) {
  return register("gem_transactions", userId, cb);
}
