/**
 * "Xoá tin nhắn phía tôi" — nguồn sự thật DÙNG CHUNG (bền vững).
 *
 * Vấn đề trước đây: id tin đã xoá chỉ nằm trong state của `chat-page`, nên khi
 * mở lại cuộc trò chuyện từ Hồ sơ (route khác / component remount trước khi
 * state kịp nạp) hoặc khi ghi `deleted_by_users` xuống DB thất bại thì tin cũ
 * hiện lại.
 *
 * Giờ mọi nơi (chat list, chat page, cache, realtime) đều lọc qua đúng module
 * này. LocalStorage giữ danh sách theo từng user; DB (`deleted_by_users`) vẫn
 * là nguồn đồng bộ đa thiết bị.
 */

const KEY = (meId: string) => `chat.hiddenMsgs::${meId}`;
const MAX = 3000;

const memory = new Map<string, Set<string>>();
const listeners = new Set<(meId: string) => void>();

function read(meId: string): Set<string> {
  const cached = memory.get(meId);
  if (cached) return cached;
  let set = new Set<string>();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY(meId));
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) set = new Set(arr.filter((x) => typeof x === "string"));
    } catch {
      /* ignore */
    }
  }
  memory.set(meId, set);
  return set;
}

function persist(meId: string, set: Set<string>) {
  memory.set(meId, set);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(meId), JSON.stringify(Array.from(set).slice(-MAX)));
  } catch {
    /* ignore */
  }
}

/** Tập id tin nhắn user hiện tại đã "xoá phía tôi". */
export function hiddenMessageIds(meId: string | null | undefined): Set<string> {
  if (!meId) return new Set();
  return read(meId);
}

export function isHiddenForMe(meId: string | null | undefined, id: string): boolean {
  if (!meId || !id) return false;
  return read(meId).has(id);
}

/** Ghi nhớ (bền vững) một hoặc nhiều tin đã xoá phía tôi. */
export function hideMessagesForMe(meId: string | null | undefined, ids: string[]): void {
  if (!meId || !ids.length) return;
  const set = new Set(read(meId));
  let changed = false;
  for (const id of ids) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  persist(meId, set);
  for (const cb of listeners) {
    try {
      cb(meId);
    } catch {
      /* noop */
    }
  }
}

/** Nghe thay đổi để UI đang mở tự ẩn tin (ví dụ realtime từ thiết bị khác). */
export function onHiddenMessagesChange(cb: (meId: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
