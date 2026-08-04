/**
 * Typing indicator realtime — dùng Supabase Realtime broadcast (không cần DB).
 *
 * Channel naming: `typing:<minId>:<maxId>` (ổn định 2 chiều).
 * Khi admin gõ → broadcast "typing" → user thấy "đang nhập…".
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const sb = supabase as any;

function channelName(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `typing:${x}:${y}`;
}

/** Hook: hiển thị typing indicator từ peer (peerId đang nhập với meId). */
export function usePeerTyping(meId: string | null | undefined, peerId: string | null | undefined): boolean {
  const [typing, setTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!meId || !peerId) return;
    const ch = sb.channel(channelName(meId, peerId), {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "typing" }, (payload: any) => {
      if (payload?.payload?.from !== peerId) return;
      setTyping(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setTyping(false), 3000);
    });
    ch.subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { sb.removeChannel(ch); } catch { /* */ }
    };
  }, [meId, peerId]);

  return typing;
}

/** Hook: gửi typing signal mỗi khi user/admin đang gõ. */
export function useSendTyping(meId: string | null | undefined, peerId: string | null | undefined) {
  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!meId || !peerId) return;
    const ch = sb.channel(channelName(meId, peerId), {
      config: { broadcast: { self: false } },
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      try { sb.removeChannel(ch); } catch { /* */ }
      channelRef.current = null;
    };
  }, [meId, peerId]);

  return () => {
    if (!channelRef.current || !meId) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle 1.5s
    lastSentRef.current = now;
    try {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { from: meId, at: now },
      });
    } catch { /* */ }
  };
}
