/**
 * "Đang xem" — presence theo từng cuộc trò chuyện, KHÔNG đụng database.
 *
 * Mỗi khi mở đúng một cuộc chat, client join channel presence
 * `chatview:<minId>:<maxId>` và track chính mình. Nếu peer cũng có mặt
 * trong channel đó ⇒ peer đang mở đúng cuộc chat này ⇒ 🟢 "Đang xem".
 *
 * Channel chỉ tồn tại trong lúc chat đang mở (unmount → leave), nên
 * không có polling và không tạo tải thường trực cho Supabase.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function channelName(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `chatview:${x}:${y}`;
}

/** true khi peer đang mở đúng cuộc trò chuyện này. */
export function usePeerViewingChat(
  meId: string | null | undefined,
  peerId: string | null | undefined,
): boolean {
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    setViewing(false);
    if (!meId || !peerId) return;

    const ch = supabase.channel(channelName(meId, peerId), {
      config: { presence: { key: meId } },
    });

    const sync = () => {
      const state = ch.presenceState() as Record<string, Array<{ user_id?: string }>>;
      const present = new Set<string>();
      Object.entries(state).forEach(([key, metas]) => {
        present.add(metas?.[0]?.user_id || key);
      });
      setViewing(present.has(peerId));
    };

    ch.on("presence", { event: "sync" }, sync);
    ch.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      try {
        await ch.track({ user_id: meId, at: new Date().toISOString() });
      } catch { /* */ }
    });

    return () => {
      setViewing(false);
      try { void supabase.removeChannel(ch); } catch { /* */ }
    };
  }, [meId, peerId]);

  return viewing;
}
