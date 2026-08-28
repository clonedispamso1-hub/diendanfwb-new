import { supabase } from "@/lib/supabase";

/**
 * Realtime presence helpers — chấm xanh online + chuỗi "Offline X ngày".
 *
 * Cách dùng:
 *   useOnlineHeartbeat(meId)   // gọi 1 lần ở root
 *   const online = useIsOnline(userId)
 *   const text = formatLastSeen(profile.last_seen)
 */

import { useEffect, useRef, useState } from "react";

const PRESENCE_CHANNEL = "presence:fwb-global";

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let channelConsumers = 0;
const onlineSet = new Set<string>();
const listeners = new Set<() => void>();

function ensureChannel(myId: string | null | undefined) {
  if (sharedChannel) {
    if (myId) void sharedChannel.track({ user_id: myId, online_at: new Date().toISOString() });
    return sharedChannel;
  }
  sharedChannel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: myId || `guest-${Math.random().toString(36).slice(2)}` } },
  });
  sharedChannel.on("presence", { event: "sync" }, () => {
    onlineSet.clear();
    const state = sharedChannel!.presenceState() as Record<string, Array<{ user_id?: string }>>;
    Object.entries(state).forEach(([key, metas]) => {
      const uid = metas?.[0]?.user_id || key;
      if (uid && !uid.startsWith("guest-")) onlineSet.add(uid);
    });
    listeners.forEach((fn) => fn());
  });
  sharedChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && myId) {
      try { await sharedChannel!.track({ user_id: myId, online_at: new Date().toISOString() }); } catch { /* */ }
    }
  });
  return sharedChannel;
}

function acquireChannel(myId: string | null | undefined) {
  channelConsumers += 1;
  return ensureChannel(myId);
}

function releaseChannel() {
  channelConsumers = Math.max(0, channelConsumers - 1);
  if (channelConsumers !== 0 || !sharedChannel) return;
  const staleChannel = sharedChannel;
  sharedChannel = null;
  onlineSet.clear();
  void supabase.removeChannel(staleChannel);
}

export function useOnlineHeartbeat(meId: string | null | undefined) {
  const lastWriteRef = useRef(0);
  useEffect(() => {
    if (!meId) return;
    acquireChannel(meId);

    const writeLastSeen = async () => {
      const now = Date.now();
      if (now - lastWriteRef.current < 25_000) return;
      lastWriteRef.current = now;
      try {
        await supabase.from("profiles").update({ last_seen: new Date().toISOString(), is_online: true } as any).eq("id", meId);
      } catch { /* cột có thể chưa tồn tại — bỏ qua */ }
    };

    void writeLastSeen();

    const onVisibility = () => { if (document.visibilityState === "visible") void writeLastSeen(); };
    const onBeforeUnload = () => {
      try {
        // best-effort offline marker
        void supabase.from("profiles").update({ is_online: false, last_seen: new Date().toISOString() } as any).eq("id", meId);
      } catch { /* */ }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseChannel();
    };
  }, [meId]);
}

export function useIsOnline(userId: string | null | undefined, isVirtual?: boolean | null) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!userId) { setOnline(false); return; }
    // Nick ảo (is_virtual=true) → luôn luôn online 24/7
    if (isVirtual) { setOnline(true); return; }
    acquireChannel(null);
    const update = () => setOnline(onlineSet.has(userId));
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
      releaseChannel();
    };
  }, [userId, isVirtual]);
  return online;
}

/** V7: Luôn hiển thị "Hoạt động" — không còn trạng thái Offline. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

export function formatLastSeen(
  _input?: string | number | Date | null,
  _isOnline?: boolean,
  _isVirtual?: boolean | null,
): string {
  return "Hoạt động";
}

