/**
 * Ghi nhớ album HOT đã mở trên thiết bị, theo từng tài khoản + album.
 * Key: album_hot_unlocked:{userId}:{albumId} → JSON { code, token, at }.
 * Chỉ ghi sau khi máy chủ xác nhận Code đúng. Khi khôi phục, Code được gửi lại
 * máy chủ để xác thực lại (nên vé hết hạn/không còn hợp lệ vẫn tự cấp lại).
 * Key cũ album_unlock:{userId}:{albumId} (chỉ có vé) vẫn được đọc để không mất album đã mở.
 */
const PREFIX = "album_hot_unlocked:";
const LEGACY_PREFIX = "album_unlock:";

export type StoredUnlock = { id: string; code?: string; token?: string };

export function unlockKey(userId: string, albumId: string) {
  return `${PREFIX}${userId}:${albumId}`;
}

export function saveUnlock(storage: Storage, userId: string, albumId: string, code: string, token?: string | null) {
  if (!userId || !albumId || !code) return;
  try {
    storage.setItem(unlockKey(userId, albumId), JSON.stringify({ code: code.toUpperCase(), token: token || undefined, at: Date.now() }));
    storage.removeItem(`${LEGACY_PREFIX}${userId}:${albumId}`);
  } catch { /* bộ nhớ đầy/bị chặn */ }
}

export function readUnlocks(storage: Storage, userId: string): StoredUnlock[] {
  if (!userId) return [];
  const byId = new Map<string, StoredUnlock>();
  const prefix = `${PREFIX}${userId}:`;
  const legacy = `${LEGACY_PREFIX}${userId}:`;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k) continue;
      const raw = storage.getItem(k);
      if (!raw) continue;
      if (k.startsWith(prefix)) {
        const id = k.slice(prefix.length);
        try {
          const v = JSON.parse(raw) as { code?: unknown; token?: unknown };
          const code = typeof v.code === "string" && v.code ? v.code : undefined;
          const token = typeof v.token === "string" && /^[0-9a-f]{64}$/.test(v.token) ? v.token : undefined;
          if (code || token) byId.set(id, { id, code, token });
        } catch { /* bỏ qua giá trị hỏng */ }
      } else if (k.startsWith(legacy)) {
        const id = k.slice(legacy.length);
        if (!byId.has(id) && /^[0-9a-f]{64}$/.test(raw)) byId.set(id, { id, token: raw });
      }
    }
  } catch { /* bỏ qua */ }
  return [...byId.values()];
}

export function removeUnlock(storage: Storage, userId: string, albumId: string) {
  try {
    storage.removeItem(unlockKey(userId, albumId));
    storage.removeItem(`${LEGACY_PREFIX}${userId}:${albumId}`);
  } catch { /* bỏ qua */ }
}
