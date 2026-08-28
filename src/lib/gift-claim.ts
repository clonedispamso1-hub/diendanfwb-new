/**
 * 🎁 LOGIC NHẬN QUÀ DÙNG CHUNG (một nguồn duy nhất).
 *
 * Nguyên tắc phân vùng database:
 *   • SUPABASE #1 (supabase): ví/xu/gem, post_gifts, message_gifts, transaction.
 *     → chỉ gọi RPC `claim_post_gift_v2` / `claim_message_gift`.
 *   • SUPABASE #3 (db3): notifications, badge, trạng thái đã nhận.
 *     → client tự UPDATE sau khi RPC thành công.
 *
 * Mọi nơi (notifications-panel, pages/Notifications, gift-bubble) PHẢI dùng
 * các hàm trong file này để logic không bị lệch nhau.
 */
import { supabase } from "@/lib/supabase";
import { socialDb as db3 } from "@/services/database";

export type GiftClaimResult = {
  ok: boolean;
  code?: string;
  message?: string;
  amount: number;
  new_balance?: number | null;
  /** true khi quà coi như "đã xử lý xong" (thành công hoặc đã nhận trước đó). */
  settled: boolean;
};

/* ------------------------------------------------------------------ */
/* 1) Nhận diện quà đang chờ nhận (dùng chung cho panel / page / badge) */
/* ------------------------------------------------------------------ */

export type ClaimableNotif = {
  id: string;
  type?: string | null;
  kind?: string | null;
  is_read?: boolean | null;
  is_claimed?: boolean | null;
  is_pending_claim?: boolean | null;
  status?: string | null;
  data?: any;
};

const DRAGON_BALL_TIERS = new Set([1, 2, 3, 4, 5, 6, 7]);

export function notifKind(n: ClaimableNotif): string {
  return String(n.kind || n.type || "").toLowerCase();
}

/** ID của quà bài viết (post_gifts.id) nếu notification này là quà bài viết. */
export function postGiftIdOf(n: ClaimableNotif): string | null {
  const k = notifKind(n);
  if (k !== "gift_post" && k !== "gift_v1") return null;
  if (DRAGON_BALL_TIERS.has(Number(n.data?.ball_tier ?? 0))) return null;
  const id = n.data?.gift_id ?? n.data?.post_gift_id ?? null;
  return id ? String(id) : null;
}

/** Đã nhận? — ưu tiên cột thật trên SB3, fallback về data JSON. */
export function isGiftClaimed(n: ClaimableNotif): boolean {
  if (n.is_claimed === true) return true;
  if (String(n.status || "").toLowerCase() === "claimed") return true;
  if (n.data?.claimed === true) return true;
  if (String(n.data?.status || "").toLowerCase() === "claimed") return true;
  return false;
}

/** Quà bài viết CHƯA nhận → phải hiện nút "🎁 Nhận quà". */
export function isPendingPostGift(n: ClaimableNotif): boolean {
  if (!postGiftIdOf(n)) return false;
  return !isGiftClaimed(n);
}

/**
 * Badge KHÔNG đếm theo is_read.
 * Badge = số quà đang chờ nhận (is_pending_claim = true hoặc chưa claimed)
 *         + các thông báo thường chưa đọc.
 */
export function countsForBadge(n: ClaimableNotif): boolean {
  if (isPendingPostGift(n)) return true;
  if (n.is_pending_claim === true && !isGiftClaimed(n)) return true;
  return n.is_read === false;
}

/* ------------------------------------------------------------------ */
/* 2) Chống spam click — hàng đợi in-flight toàn cục                    */
/* ------------------------------------------------------------------ */

const inFlight = new Set<string>();

export const isClaiming = (giftId: string) => inFlight.has(giftId);

/* ------------------------------------------------------------------ */
/* 3) Cập nhật notification trên SB3 (KHÔNG dùng SB1)                  */
/* ------------------------------------------------------------------ */

/**
 * Sau khi CLAIM thành công: thông báo quà phải BIẾN MẤT khỏi chuông.
 * Ưu tiên RPC idempotent theo gift_id (xoá hàng), fallback xoá theo notif id,
 * cuối cùng mới fallback update trạng thái (schema cũ / thiếu quyền xoá).
 */
export async function markNotificationClaimedOnSB3(
  notifId: string | null | undefined,
  prevData?: any,
  giftId?: string | null,
): Promise<void> {
  if (giftId) {
    const { error } = await db3().rpc("delete_post_gift_notification_v6" as any, { p_gift_id: giftId });
    if (!error) return;
    const legacy = await db3().rpc("mark_post_gift_claimed_v5" as any, { p_gift_id: giftId });
    if (!legacy.error && !notifId) return;
  }
  if (!notifId) return;
  const del = await db3().from("notifications").delete().eq("id", notifId).select("id");
  if (!del.error && (del.data?.length ?? 0) > 0) return;
  const data = {
    ...(prevData && typeof prevData === "object" ? prevData : {}),
    claimed: true,
    status: "claimed",
    claimed_at: new Date().toISOString(),
  };
  const full = {
    is_claimed: true,
    is_read: true,
    status: "claimed",
    is_pending_claim: false,
    data,
  };
  const { error } = await db3().from("notifications").update(full as any).eq("id", notifId);
  if (!error) return;
  // Fallback khi DB chưa có đủ cột (schema cũ) — vẫn phải lưu trạng thái.
  await db3()
    .from("notifications")
    .update({ is_read: true, data } as any)
    .eq("id", notifId);
}


/** Tìm notification trên SB3 theo gift_id (khi không biết notif id). */
export async function findNotifIdByGiftId(giftId: string): Promise<string | null> {
  const { data } = await db3()
    .from("notifications")
    .select("id")
    .eq("data->>gift_id", giftId as any)
    .limit(1);
  const row = (data || [])[0] as any;
  return row?.id ? String(row.id) : null;
}

/* ------------------------------------------------------------------ */
/* 4) Nhận quà bài viết                                                */
/* ------------------------------------------------------------------ */

export async function claimPostGift(opts: {
  giftId: string;
  notifId?: string | null;
  notifData?: any;
}): Promise<GiftClaimResult> {
  const { giftId } = opts;
  if (!giftId) {
    return { ok: false, code: "GIFT_NOT_FOUND", message: "Không tìm thấy quà.", amount: 0, settled: false };
  }
  if (inFlight.has(giftId)) {
    return { ok: false, code: "IN_FLIGHT", message: "Đang nhận quà…", amount: 0, settled: false };
  }
  inFlight.add(giftId);
  try {
    // 1) SB1: cộng xu + đánh dấu post_gifts.claimed (atomic).
    let res: any = null;
    let rpcError: any = null;
    {
      const r = await supabase.rpc("claim_post_gift_v2" as any, { p_gift_id: giftId });
      res = r.data;
      rpcError = r.error;
    }
    // RPC v2 chưa được cài trên DB → thử bản tương thích.
    if (rpcError) {
      const r = await supabase.rpc("claim_post_gift" as any, { p_gift_id: giftId });
      if (!r.error) {
        res = r.data;
        rpcError = null;
      }
    }

    if (rpcError && !res) {
      return {
        ok: false,
        code: "RPC_ERROR",
        message: rpcError.message || "Không thể nhận quà.",
        amount: 0,
        settled: false,
      };
    }

    const ok = Boolean(res?.ok);
    const already = String(res?.code || "") === "ALREADY_CLAIMED";

    // 2) SB3: cập nhật notification (kể cả khi đã nhận trước đó → dọn badge).
    if (ok || already) {
      const notifId = opts.notifId ?? res?.notif_id ?? (await findNotifIdByGiftId(giftId));
      await markNotificationClaimedOnSB3(notifId, opts.notifData, giftId);
    }

    return {
      ok,
      code: res?.code,
      message: res?.message,
      amount: Number(res?.amount) || 0,
      new_balance: Number.isFinite(Number(res?.new_balance)) ? Number(res?.new_balance) : null,
      settled: ok || already,
    };
  } finally {
    inFlight.delete(giftId);
  }
}


/* ------------------------------------------------------------------ */
/* 4b) Nhận TẤT CẢ quà bài viết — RPC claim_all_post_gifts_v2()        */
/* ------------------------------------------------------------------ */

export type ClaimAllResult = {
  ok: boolean;
  /** true khi RPC gộp chạy được (không cần fallback vòng lặp). */
  supported: boolean;
  total: number;
  count: number;
  new_balance?: number | null;
  message?: string;
  /** Danh sách gift_id đã được xử lý (nếu RPC trả về). */
  giftIds: string[];
};

/**
 * Gọi RPC gộp `claim_all_post_gifts_v2()` (Two-Phase Claim ở DB).
 * Trả về supported=false khi RPC chưa tồn tại → caller tự fallback vòng lặp.
 */
export async function claimAllPostGiftsRpc(): Promise<ClaimAllResult> {
  const { data, error } = await supabase.rpc("claim_all_post_gifts_v2" as any);
  if (error) {
    return { ok: false, supported: false, total: 0, count: 0, message: error.message, giftIds: [] };
  }
  const res: any = Array.isArray(data) ? data[0] : data;
  const total = Number(res?.total ?? res?.total_amount ?? res?.amount) || 0;
  const count = Number(res?.count ?? res?.claimed_count ?? res?.claimed) || 0;
  const giftIds = Array.isArray(res?.gift_ids) ? res.gift_ids.map(String) : [];
  return {
    ok: Boolean(res?.ok ?? true),
    supported: true,
    total,
    count,
    new_balance: Number.isFinite(Number(res?.new_balance)) ? Number(res?.new_balance) : null,
    message: res?.message,
    giftIds,
  };
}


/* ------------------------------------------------------------------ */
/* 5) Nhận quà trong chat (message gift) — CÙNG logic                  */
/* ------------------------------------------------------------------ */

export async function claimMessageGift(opts: {
  giftId: string;
  notifId?: string | null;
}): Promise<GiftClaimResult> {
  const { giftId } = opts;
  if (!giftId) {
    return { ok: false, code: "GIFT_NOT_FOUND", message: "Không tìm thấy quà.", amount: 0, settled: false };
  }
  if (inFlight.has(giftId)) {
    return { ok: false, code: "IN_FLIGHT", message: "Đang nhận quà…", amount: 0, settled: false };
  }
  inFlight.add(giftId);
  try {
    const { data, error } = await supabase.rpc("claim_message_gift" as any, { p_gift_id: giftId });
    const res: any = data;
    if (error && !res) {
      return {
        ok: false,
        code: "RPC_ERROR",
        message: error.message || "Không thể nhận quà.",
        amount: 0,
        settled: false,
      };
    }
    const ok = Boolean(res?.ok);
    const already = String(res?.code || "") === "ALREADY_CLAIMED";
    if (ok || already) {
      const notifId = opts.notifId ?? (await findNotifIdByGiftId(giftId));
      await markNotificationClaimedOnSB3(notifId, undefined, giftId);
    }
    return {
      ok,
      code: res?.code,
      message: res?.message,
      amount: Number(res?.amount) || 0,
      new_balance: Number.isFinite(Number(res?.new_balance)) ? Number(res?.new_balance) : null,
      settled: ok || already,
    };
  } finally {
    inFlight.delete(giftId);
  }
}
