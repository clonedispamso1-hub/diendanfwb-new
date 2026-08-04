/**
 * Live Móc 🦋 — ai đang Live (dùng cho badge 🔴 LIVE toàn website).
 *
 * Hiệu năng: KHÔNG polling, KHÔNG websocket. Chỉ fetch 1 lần rồi cache trong
 * bộ nhớ (TTL 5 phút). Mọi component dùng chung 1 lần gọi mạng duy nhất.
 */
import { useEffect, useState } from "react";
import { fetchLiveRooms, isRoomLiveNow, type LiveMocRoom } from "@/lib/live-moc";

const TTL = 5 * 60 * 1000;

/** userId -> roomId của phòng người đó đang Live. */
let map: Record<string, string> = {};
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function buildLiveUserMap(rooms: LiveMocRoom[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const r of rooms) {
    if (!r.live_user_id || !r.is_online || !r.visible) continue;
    if (!isRoomLiveNow(r)) continue;
    next[r.live_user_id] = r.id;
  }
  return next;
}

/** Cập nhật cache từ danh sách phòng vừa fetch ở nơi khác (tránh gọi lại mạng). */
export function primeLiveUsers(rooms: LiveMocRoom[]) {
  map = buildLiveUserMap(rooms);
  loadedAt = Date.now();
  emit();
}

export function ensureLiveUsers(): Promise<void> {
  if (Date.now() - loadedAt < TTL) return Promise.resolve();
  if (inflight) return inflight;
  inflight = fetchLiveRooms()
    .then((rooms) => primeLiveUsers(rooms))
    .catch(() => {
      loadedAt = Date.now();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getLiveRoomIdOf(userId?: string | null): string | null {
  if (!userId) return null;
  return map[userId] ?? null;
}

/** Hook nhẹ: trả về roomId nếu user này đang Live, ngược lại null. */
export function useIsUserLive(userId?: string | null): string | null {
  const [roomId, setRoomId] = useState<string | null>(() => getLiveRoomIdOf(userId));

  useEffect(() => {
    if (!userId) {
      setRoomId(null);
      return;
    }
    const sync = () => setRoomId(getLiveRoomIdOf(userId));
    listeners.add(sync);
    void ensureLiveUsers().then(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [userId]);

  return roomId;
}

/** Mở tab Live Móc 🦋 và cuộn tới đúng phòng. */
export function openLiveRoom(roomId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("livemoc.focus", roomId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("app:open-live", { detail: { roomId } }));
}