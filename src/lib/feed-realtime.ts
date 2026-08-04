// Feed-scope realtime singleton.
//
// Problem it solves:
//   `supabase.channel("feed-posts").subscribe()` was called from a component
//   effect keyed on `[activeCategory, me?.id]`. Every tab switch (or any
//   remount) tore down the channel and opened a fresh one. Rapid switches
//   plus StrictMode double-invoke would leave short-lived duplicate
//   subscriptions.
//
// This module keeps ONE channel per (channelKey) shared by all subscribers,
// ref-counts them, and only calls `removeChannel` when the last subscriber
// unmounts. Scrolling has no effect (no state change → no re-subscribe).

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Payload = RealtimePostgresChangesPayload<Row>;

export interface FeedRealtimeHandlers {
  onPostInsert?: (row: Row | undefined) => void;
  onPostUpdate?: (row: Row | undefined) => void;
  onPostDelete?: (row: Row | undefined) => void;
  onVideoChange?: (row: Row | undefined) => void;
  onStatus?: (status: string) => void;
}

interface Entry {
  channel: RealtimeChannel;
  refCount: number;
  handlers: Set<FeedRealtimeHandlers>;
  lastStatus: string | null;
}

const pickNew = (p: Payload): Row | undefined => (p as { new?: Row }).new ?? undefined;
const pickOld = (p: Payload): Row | undefined => (p as { old?: Row }).old ?? undefined;

const registry = new Map<string, Entry>();

function ensureChannel(key: string): Entry {
  const existing = registry.get(key);
  if (existing) return existing;

  const handlers = new Set<FeedRealtimeHandlers>();
  const entry: Entry = {
    handlers,
    refCount: 0,
    lastStatus: null,
    channel: null as unknown as RealtimeChannel,
  };

  const channel = supabase
    .channel(key)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (p: Payload) =>
      handlers.forEach((h) => h.onPostInsert?.(pickNew(p))),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, (p: Payload) =>
      handlers.forEach((h) => h.onPostUpdate?.(pickNew(p))),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (p: Payload) =>
      handlers.forEach((h) => h.onPostDelete?.(pickOld(p))),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "videos_social" },
      (p: Payload) => handlers.forEach((h) => h.onVideoChange?.(pickNew(p) ?? pickOld(p))),
    )
    .subscribe((status) => {
      entry.lastStatus = status;
      handlers.forEach((h) => h.onStatus?.(status));
    });

  entry.channel = channel;
  registry.set(key, entry);
  return entry;
}

/** Subscribe to the shared feed channel. Returns unsubscribe. */
export function subscribeFeedRealtime(
  handlers: FeedRealtimeHandlers,
  channelKey = "feed-posts",
): () => void {
  const entry = ensureChannel(channelKey);
  entry.handlers.add(handlers);
  entry.refCount += 1;
  // Replay last known status so late subscribers get an initial state.
  if (entry.lastStatus) {
    try {
      handlers.onStatus?.(entry.lastStatus);
    } catch {
      /* noop */
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.handlers.delete(handlers);
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      registry.delete(channelKey);
      try {
        void supabase.removeChannel(entry.channel);
      } catch {
        /* noop */
      }
    }
  };
}

/** React hook wrapper. Handlers passed in a ref-stable object recommended. */
export function useFeedRealtime(handlers: FeedRealtimeHandlers, channelKey = "feed-posts") {
  useEffect(() => {
    const off = subscribeFeedRealtime(handlers, channelKey);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);
}
