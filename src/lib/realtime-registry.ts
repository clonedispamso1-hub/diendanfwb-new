/**
 * realtime-registry — MỘT nơi duy nhất tạo Supabase Realtime channel.
 *
 * Vấn đề: trước đây mỗi component tự gọi `supabase.channel(...)` trong effect.
 *   - Tên channel ngẫu nhiên (`Math.random()`) → mỗi lần remount là 1 channel mới.
 *   - Nhiều component nghe cùng 1 bảng → N channel trùng nhau.
 *   - Quên `removeChannel` khi unmount → channel rò rỉ, egress tăng liên tục.
 *
 * Giải pháp: registry ref-count theo `key`.
 *   - Cùng `key` → dùng lại đúng 1 channel (không bao giờ tạo trùng).
 *   - Subscriber cuối cùng unmount → `removeChannel` được gọi đúng 1 lần.
 *   - Handler được gọi qua fan-out nội bộ nên thêm listener KHÔNG tạo socket mới.
 *
 * Không đổi schema / RLS / API key — thuần frontend.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
export type ChangePayload = RealtimePostgresChangesPayload<Row>;

export interface TopicSpec {
  /** Tên bảng trong schema public. */
  table: string;
  /** INSERT | UPDATE | DELETE | * (mặc định *). */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Bộ lọc phía server, vd `user_id=eq.<uuid>` — luôn ưu tiên dùng để giảm egress. */
  filter?: string;
  /** Schema, mặc định "public". */
  schema?: string;
}

export type Listener = (payload: ChangePayload, topicIndex: number) => void;

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  statusListeners: Set<(status: string) => void>;
  refCount: number;
  lastStatus: string | null;
}

const registry = new Map<string, Entry>();
let channelSeq = 0;


export const pickNew = (p: ChangePayload): Row | undefined => (p as { new?: Row }).new ?? undefined;
export const pickOld = (p: ChangePayload): Row | undefined => (p as { old?: Row }).old ?? undefined;
export const pickRow = (p: ChangePayload): Row | undefined => pickNew(p) ?? pickOld(p);

function ensureEntry(key: string, topics: TopicSpec[]): Entry {
  const existing = registry.get(key);
  if (existing) return existing;

  const listeners = new Set<Listener>();
  const statusListeners = new Set<(status: string) => void>();
  const entry: Entry = {
    listeners,
    statusListeners,
    refCount: 0,
    lastStatus: null,
    channel: null as unknown as RealtimeChannel,
  };

  // Tên topic phải DUY NHẤT mỗi lần tạo: supabase-js tái sử dụng channel cùng
  // topic, nếu channel cũ chưa kịp remove sẽ ném
  // "cannot add postgres_changes callbacks after subscribe()".
  channelSeq += 1;
  let ch = supabase.channel(`${key}#${channelSeq}`);

  topics.forEach((topic, index) => {
    ch = (ch as RealtimeChannel).on(
      "postgres_changes" as never,
      {
        event: topic.event ?? "*",
        schema: topic.schema ?? "public",
        table: topic.table,
        ...(topic.filter ? { filter: topic.filter } : {}),
      },
      (payload: ChangePayload) => {
        listeners.forEach((cb) => {
          try {
            cb(payload, index);
          } catch (err) {
            console.error(`[realtime:${key}] listener error`, err);
          }
        });
      },
    );
  });

  entry.channel = ch.subscribe((status: string) => {
    entry.lastStatus = status;
    statusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch {
        /* noop */
      }
    });
  });

  registry.set(key, entry);
  return entry;
}

export interface SubscribeOptions {
  /** Khoá duy nhất của channel. Cùng khoá = dùng lại channel, KHÔNG tạo trùng. */
  key: string;
  /** Danh sách bảng/sự kiện channel này lắng nghe. Chỉ dùng khi tạo mới. */
  topics: TopicSpec[];
  onChange: Listener;
  onStatus?: (status: string) => void;
}

/**
 * Đăng ký listener vào channel dùng chung. Trả về hàm huỷ đăng ký
 * (idempotent — gọi nhiều lần vẫn an toàn).
 */
export function subscribeRealtime({ key, topics, onChange, onStatus }: SubscribeOptions): () => void {
  const entry = ensureEntry(key, topics);
  entry.listeners.add(onChange);
  if (onStatus) {
    entry.statusListeners.add(onStatus);
    if (entry.lastStatus) {
      try {
        onStatus(entry.lastStatus);
      } catch {
        /* noop */
      }
    }
  }
  entry.refCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.listeners.delete(onChange);
    if (onStatus) entry.statusListeners.delete(onStatus);
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      registry.delete(key);
      try {
        void supabase.removeChannel(entry.channel);
      } catch {
        /* noop */
      }
    }
  };
}

/**
 * Hook React: tự huỷ đăng ký khi unmount. Handler được giữ trong ref nên
 * đổi callback KHÔNG khiến channel bị tạo lại.
 */
export function useRealtime(
  key: string | null | undefined,
  topics: TopicSpec[],
  onChange: Listener,
  onStatus?: (status: string) => void,
) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  const topicsKey = JSON.stringify(topics);

  useEffect(() => {
    if (!key) return;
    const off = subscribeRealtime({
      key,
      topics: JSON.parse(topicsKey) as TopicSpec[],
      onChange: (p, i) => changeRef.current?.(p, i),
      onStatus: (s) => statusRef.current?.(s),
    });
    return off;
  }, [key, topicsKey]);
}

/** Số channel đang mở — dùng cho audit/perf debug. */
export function activeChannelCount() {
  return registry.size;
}

/** Danh sách khoá channel đang mở kèm số subscriber. */
export function activeChannels() {
  return [...registry.entries()].map(([key, e]) => ({ key, refCount: e.refCount, status: e.lastStatus }));
}
