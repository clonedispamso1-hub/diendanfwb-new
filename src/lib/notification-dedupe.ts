/**
 * Dedupe notifications: một giao dịch = một thông báo.
 *
 * Khi ai đó TẶNG QUÀ, hệ thống (trigger + realtime) có thể sinh thêm một bản
 * ghi phụ dạng "chuyển xu / chuyển Gem" cho cùng giao dịch đó. Bản ghi phụ này
 * là thừa và phải bị loại bỏ ở tầng hiển thị.
 */

type AnyNotif = {
  id?: string;
  type?: string | null;
  kind?: string | null;
  data?: any;
  last_actor_id?: string | null;
  created_at?: string | null;
};

const TRANSFER_KINDS = new Set([
  "wallet_transfer",
  "gem_received",
  "gem_transfer",
  "candy_transfer",
  "coin_transfer",
  "transfer",
]);

const GIFT_KINDS = new Set(["gift_post", "gift_v1", "gift_video", "gift"]);

const kindOf = (n: AnyNotif) => String(n.kind || n.type || "").toLowerCase();

const actorOf = (n: AnyNotif) =>
  String(
    n.last_actor_id ||
      n.data?.sender_id ||
      n.data?.from_user_id ||
      n.data?.actor_id ||
      "",
  );

const amountOf = (n: AnyNotif) =>
  Number(n.data?.amount ?? n.data?.gift_amount ?? n.data?.gem_amount ?? 0) || 0;

const timeOf = (n: AnyNotif) => {
  const t = Date.parse(String(n.created_at || ""));
  return Number.isFinite(t) ? t : 0;
};

/** Bản ghi "chuyển xu" nhưng thực chất sinh ra từ một giao dịch tặng quà. */
function isGiftEcho(n: AnyNotif): boolean {
  const k = kindOf(n);
  if (!TRANSFER_KINDS.has(k)) return false;
  const d = n.data || {};
  if (d.gift_id || d.post_gift_id || d.gift_name || d.gift_emoji) return true;
  const tier = Number(d.ball_tier ?? 0);
  if (tier >= 1 && tier <= 7) return true;
  const action = String(d.action_type || d.transaction_type || d.source || "").toLowerCase();
  if (action.includes("gift")) return true;
  return false;
}

/**
 * Loại bỏ notification "chuyển xu/Gem" trùng với một notification quà tặng
 * (cùng người gửi + cùng số tiền, trong vòng 3 phút).
 */
export function dedupeNotifications<T extends AnyNotif>(rows: T[]): T[] {
  const gifts = rows.filter((n) => GIFT_KINDS.has(kindOf(n)));

  return rows.filter((n) => {
    if (isGiftEcho(n)) return false;
    if (!TRANSFER_KINDS.has(kindOf(n))) return true;

    const actor = actorOf(n);
    const amount = amountOf(n);
    const ts = timeOf(n);
    const twin = gifts.some((g) => {
      if (actor && actorOf(g) && actorOf(g) !== actor) return false;
      if (amount <= 0 || amountOf(g) !== amount) return false;
      const gt = timeOf(g);
      if (!ts || !gt) return true;
      return Math.abs(ts - gt) <= 3 * 60 * 1000;
    });
    return !twin;
  });
}
