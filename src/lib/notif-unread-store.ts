/**
 * 🔔 SHARED NOTIFICATION COUNTER STORE (SB3 only).
 *
 * Mục tiêu: badge đỏ = đúng số notification chưa đọc, KHÔNG polling,
 * KHÔNG query lặp ở từng component.
 *
 *  • TÁCH RIÊNG hai con số:
 *      - `unread`     : notification chưa đọc (không tính quà đang chờ nhận).
 *      - `pendingGift`: quà đang chờ nhận (is_pending_claim = true).
 *    `total = unread + pendingGift` chỉ dùng cho badge tổng ngoài Dock.
 *  • Đúng MỘT cặp query count (head:true, không kéo dữ liệu → egress ~0) cho
 *    mỗi lần cần đồng bộ; nhiều component mount cùng lúc chỉ dùng chung 1
 *    request (dedupe in-flight + throttle tối thiểu 5s giữa 2 lần refetch).
 *  • Realtime: dùng lại channel duy nhất `app-notif-<userId>`
 *    (@/lib/notification-realtime) — KHÔNG mở subscription mới. Các component
 *    khác (panel, trang Notifications) đăng ký qua `subscribeNotifChange`
 *    để dùng chung đúng listener này, không tạo handler trùng.
 *      - INSERT  → tăng badge NGAY (optimistic), không gọi DB.
 *      - UPDATE/DELETE (đã đọc / xoá) → chỉ giảm SAU khi DB xác nhận, bằng
 *        một lần count lại đã throttle.
 *  • Không đụng SB1/SB2, không đụng Gem/Gift/Wallet.
 */
import { socialDb as db3 } from "@/services/database";
import { notificationCutoffISO } from "@/lib/notifications-retention";
import { onNotificationEvent } from "@/lib/notification-realtime";

export interface NotifCounts {
  unread: number;
  pendingGift: number;
  total: number;
}

type Sub = (count: number) => void;
type CountsSub = (counts: NotifCounts) => void;
type ChangeSub = (payload: unknown) => void;

const subs = new Set<Sub>();
const countsSubs = new Set<CountsSub>();
const changeSubs = new Set<ChangeSub>();

let currentUserId: string | null = null;
let unread = 0;
let pendingGift = 0;
let lastFetchAt = 0;
let inFlight: Promise<NotifCounts> | null = null;
let offRealtime: (() => void) | null = null;

const MIN_REFETCH_MS = 5_000;

/** Các loại KHÔNG tính vào badge (chat/like) — đồng bộ với panel. */
const EXCLUDED = ["message", "chat_message", "dm", "like", "like_post", "post_like"];

function snapshot(): NotifCounts {
  return { unread, pendingGift, total: unread + pendingGift };
}

function emit() {
  const snap = snapshot();
  for (const cb of subs) {
    try {
      cb(snap.total);
    } catch {
      /* noop */
    }
  }
  for (const cb of countsSubs) {
    try {
      cb(snap);
    } catch {
      /* noop */
    }
  }
}

function setCounts(nextUnread: number, nextPending: number) {
  const u = Math.max(0, nextUnread);
  const p = Math.max(0, nextPending);
  if (u === unread && p === pendingGift) return;
  unread = u;
  pendingGift = p;
  emit();
}

async function fetchCounts(userId: string): Promise<NotifCounts> {
  const cutoff = notificationCutoffISO();

  const unreadQuery = db3()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)
    .or("is_pending_claim.is.null,is_pending_claim.eq.false")
    .gte("created_at", cutoff)
    // NULL-safe: hàng có type/kind = NULL vẫn phải được đếm.
    .or(`type.is.null,type.not.in.("${EXCLUDED.join('","')}")`)
    .or('kind.is.null,kind.not.in.("like","like_post","post_like")');

  const pendingQuery = db3()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_pending_claim", true)
    .gte("created_at", cutoff);

  const [u, p] = await Promise.all([unreadQuery, pendingQuery]);
  return {
    unread: u.error ? unread : (u.count ?? 0),
    pendingGift: p.error ? pendingGift : (p.count ?? 0),
    total: 0,
  };
}

/** Đồng bộ badge với DB. `force` bỏ qua throttle (vd. sau khi mark-read). */
export async function refreshUnread(force = false): Promise<number> {
  const uid = currentUserId;
  if (!uid) return 0;
  const now = Date.now();
  if (!force && now - lastFetchAt < MIN_REFETCH_MS) return snapshot().total;
  if (inFlight) return inFlight.then((c) => c.unread + c.pendingGift);
  lastFetchAt = now;
  inFlight = fetchCounts(uid)
    .then((c) => {
      setCounts(c.unread, c.pendingGift);
      return snapshot();
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight.then((c) => c.total);
}

/** Badge tăng ngay khi có notification mới (không chờ DB). */
export function bumpUnread(delta = 1) {
  setCounts(unread + delta, pendingGift);
}

/** Gọi sau khi quà đã CLAIM xong (thông báo bị xoá) — giảm badge quà. */
export function confirmGiftClaimed(n = 1) {
  setCounts(unread, pendingGift - n);
  void refreshUnread(true);
}

/** Gọi sau khi DB đã xác nhận đánh dấu đã đọc / xoá. */
export function confirmRead(n = 1) {
  setCounts(unread - n, pendingGift);
  void refreshUnread(true);
}

function ensureRealtime(userId: string) {
  if (offRealtime && currentUserId === userId) return;
  offRealtime?.();
  offRealtime = onNotificationEvent(userId, (payload) => {
    // Phát lại cho mọi component đã đăng ký — KHÔNG mở subscription thứ hai.
    for (const cb of changeSubs) {
      try {
        cb(payload);
      } catch {
        /* noop */
      }
    }

    if ((payload as any)?.eventType === "INSERT") {
      const row = (payload as any).new || {};
      const t = String(row.type || "").toLowerCase();
      const k = String(row.kind || "").toLowerCase();
      if (row.is_pending_claim === true) {
        setCounts(unread, pendingGift + 1);
        return;
      }
      if (EXCLUDED.includes(t) || EXCLUDED.includes(k)) return;
      if (row.is_read === true) return;
      bumpUnread(1);
      return;
    }
    // UPDATE / DELETE: chỉ tin DB (throttled count).
    void refreshUnread();
  });
}

function attach(userId: string | null | undefined): boolean {
  if (!userId) {
    currentUserId = null;
    offRealtime?.();
    offRealtime = null;
    setCounts(0, 0);
    return false;
  }
  if (currentUserId !== userId) {
    currentUserId = userId;
    unread = 0;
    pendingGift = 0;
    lastFetchAt = 0;
  }
  ensureRealtime(userId);
  return true;
}

function detachIfIdle() {
  if (subs.size === 0 && countsSubs.size === 0 && changeSubs.size === 0) {
    offRealtime?.();
    offRealtime = null;
    currentUserId = null;
  }
}

/** Đăng ký một component vào badge dùng chung (tổng unread + quà chờ nhận). */
export function subscribeUnread(userId: string | null | undefined, cb: Sub): () => void {
  if (!attach(userId)) {
    cb(0);
    return () => {};
  }
  subs.add(cb);
  cb(snapshot().total);
  void refreshUnread(true);
  return () => {
    subs.delete(cb);
    detachIfIdle();
  };
}

/** Đăng ký để nhận riêng từng con số (unread / pendingGift). */
export function subscribeCounts(
  userId: string | null | undefined,
  cb: CountsSub,
): () => void {
  if (!attach(userId)) {
    cb({ unread: 0, pendingGift: 0, total: 0 });
    return () => {};
  }
  countsSubs.add(cb);
  cb(snapshot());
  void refreshUnread(true);
  return () => {
    countsSubs.delete(cb);
    detachIfIdle();
  };
}

/**
 * Đăng ký nhận sự kiện realtime của bảng `notifications` mà KHÔNG mở thêm
 * channel/handler nào. Dùng cho panel & trang Notifications để reload danh sách.
 */
export function subscribeNotifChange(
  userId: string | null | undefined,
  cb: ChangeSub,
): () => void {
  if (!attach(userId)) return () => {};
  changeSubs.add(cb);
  return () => {
    changeSubs.delete(cb);
    detachIfIdle();
  };
}

export const unreadCount = () => snapshot().total;
export const unreadOnlyCount = () => unread;
export const pendingGiftCount = () => pendingGift;
