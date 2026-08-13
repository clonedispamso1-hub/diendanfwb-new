/**
 * Global notification realtime bus — uỷ quyền cho `realtime-registry`.
 *
 * Ràng buộc được giữ nguyên:
 *  - Chỉ MỘT channel realtime cho toàn bộ bảng liên quan tới thông báo
 *    (`app-notif-<userId>` — cùng key thì registry tái sử dụng, không tạo trùng).
 *  - Mọi handler `postgres_changes` được đăng ký TRƯỚC `subscribe()` (registry lo).
 *  - Ref-count: channel tạo khi có listener đầu tiên, gỡ khi listener cuối rời đi.
 *  - Đổi user → huỷ đăng ký channel cũ, đăng ký channel của user mới.
 *  - Không bao giờ có channel trùng, không rò rỉ subscription.
 */
import { subscribeRealtime, type ChangePayload } from "@/lib/realtime-registry";

type Payload = ChangePayload;
type Listener = (payload: Payload) => void;

type BucketKey = "notifications" | "gem_transactions";

const listeners: Record<BucketKey, Set<Listener>> = {
  notifications: new Set(),
  gem_transactions: new Set(),
};

let currentUserId: string | null = null;
let unsubscribe: (() => void) | null = null;

function totalListeners(): number {
  return listeners.notifications.size + listeners.gem_transactions.size;
}

function teardown() {
  try {
    unsubscribe?.();
  } catch {
    /* noop */
  }
  unsubscribe = null;
  currentUserId = null;
}

function ensureChannel(userId: string) {
  if (unsubscribe && currentUserId === userId) return;
  teardown();
  currentUserId = userId;
  unsubscribe = subscribeRealtime({
    key: `app-notif-${userId}`,
    topics: [
      { table: "notifications", event: "*", filter: `user_id=eq.${userId}` },
      { table: "gem_transactions", event: "INSERT", filter: `to_id=eq.${userId}` },
    ],
    onChange: (payload, topicIndex) => {
      const bucket: BucketKey = topicIndex === 0 ? "notifications" : "gem_transactions";
      for (const cb of listeners[bucket]) {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[${bucket}-rt] listener error`, err);
        }
      }
    },
  });
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
