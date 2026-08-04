import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { guardAction } from "@/lib/rate-limit";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
}

/**
 * Hook quản lý reactions cho một tập tin nhắn (DM).
 * - Nạp toàn bộ reactions của các message hiện tại.
 * - Subscribe realtime (INSERT/UPDATE/DELETE) trên bảng message_reactions.
 * - Cung cấp helper toggleReaction: đúng logic Messenger
 *     • Chưa có reaction  → INSERT
 *     • Cùng emoji        → DELETE (bỏ)
 *     • Khác emoji        → UPDATE (không INSERT thêm)
 */
export function useMessageReactions(messageIds: string[], meId: string | null | undefined) {
  const [rows, setRows] = useState<ReactionRow[]>([]);
  const idsKey = useMemo(() => [...messageIds].sort().join(","), [messageIds]);
  const idsRef = useRef<Set<string>>(new Set(messageIds));

  useEffect(() => {
    idsRef.current = new Set(messageIds);
  }, [idsKey, messageIds]);

  // Load
  useEffect(() => {
    if (!meId || messageIds.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("message_reactions" as any)
        .select("id, message_id, user_id, emoji, created_at, updated_at")
        .in("message_id", messageIds);
      if (cancelled) return;
      if (error) {
        console.warn("[reactions] load failed", error);
        return;
      }
      setRows((data as ReactionRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, meId]);

  // Realtime — subscribe theo cuộc chat (cả 2 phía đều đang mount cùng messageIds).
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`message_reactions:${meId}:${idsKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const newRow = payload.new as ReactionRow | null;
          const oldRow = payload.old as ReactionRow | null;
          const relevantId = newRow?.message_id ?? oldRow?.message_id;
          if (!relevantId || !idsRef.current.has(relevantId)) return;

          setRows((cur) => {
            if (payload.eventType === "DELETE") {
              return cur.filter((r) => r.id !== oldRow?.id);
            }
            if (payload.eventType === "INSERT" && newRow) {
              if (cur.some((r) => r.id === newRow.id)) return cur;
              // Đảm bảo unique(message_id,user_id): thay bằng row mới.
              const filtered = cur.filter(
                (r) => !(r.message_id === newRow.message_id && r.user_id === newRow.user_id),
              );
              return [...filtered, newRow];
            }
            if (payload.eventType === "UPDATE" && newRow) {
              return cur.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r));
            }
            return cur;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [idsKey, meId]);

  const byMessage = useMemo(() => {
    const map = new Map<string, AggregatedReaction[]>();
    for (const r of rows) {
      const list = map.get(r.message_id) ?? [];
      let bucket = list.find((b) => b.emoji === r.emoji);
      if (!bucket) {
        bucket = { emoji: r.emoji, count: 0, userIds: [], mine: false };
        list.push(bucket);
      }
      bucket.count += 1;
      bucket.userIds.push(r.user_id);
      if (r.user_id === meId) bucket.mine = true;
      map.set(r.message_id, list);
    }
    return map;
  }, [rows, meId]);

  const myReactionByMessage = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const r of rows) {
      if (r.user_id === meId) map[r.message_id] = r.emoji;
    }
    return map;
  }, [rows, meId]);

  /** Messenger-style toggle. */
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!meId) return;
      if (!(await guardAction("reaction"))) return;
      const existing = rows.find((r) => r.message_id === messageId && r.user_id === meId);

      // Optimistic update
      setRows((cur) => {
        if (!existing) {
          return [
            ...cur,
            {
              id: `optimistic-${messageId}-${meId}`,
              message_id: messageId,
              user_id: meId,
              emoji,
            },
          ];
        }
        if (existing.emoji === emoji) {
          return cur.filter((r) => r.id !== existing.id);
        }
        return cur.map((r) => (r.id === existing.id ? { ...r, emoji } : r));
      });

      try {
        if (!existing) {
          const { error } = await supabase
            .from("message_reactions" as any)
            .insert({ message_id: messageId, user_id: meId, emoji });
          if (error) throw error;
        } else if (existing.emoji === emoji) {
          const { error } = await supabase
            .from("message_reactions" as any)
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("message_reactions" as any)
            .update({ emoji })
            .eq("id", existing.id);
          if (error) throw error;
        }
      } catch (err) {
        console.warn("[reactions] toggle failed, refetching", err);
        // Rollback bằng cách reload nguyên set.
        const { data } = await supabase
          .from("message_reactions" as any)
          .select("id, message_id, user_id, emoji, created_at, updated_at")
          .in("message_id", Array.from(idsRef.current));
        setRows((data as ReactionRow[]) || []);
      }
    },
    [meId, rows],
  );

  return { rows, byMessage, myReactionByMessage, toggleReaction };
}
