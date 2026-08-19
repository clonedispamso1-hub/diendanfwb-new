/**
 * NotificationsPanel v4 — rewrite (Facebook/Threads-style).
 *
 * Nguồn dữ liệu:
 *   • Bảng public.notifications đã được aggregate ở phía DB (trigger + RPC
 *     trong docs/sql/2026-07-05_notifications_v4_rewrite.sql).
 *   • Panel KHÔNG tự dedup / gom nữa — trust DB.
 *
 * Loại notification hỗ trợ:
 *   follow           → aggregate theo user (recipient), actors[] là followers
 *   like             → aggregate theo post_id, actors[] là likers
 *   comment          → 1 row/comment, click mở post + scroll tới comment
 *   comment_reply    → 1 row/reply,   click mở post + scroll tới reply
 *   wallet_transfer  → 1 row/tx, click mở /wallet
 *   system           → 1 row, không aggregate
 *   + legacy gift/candy rows vẫn hiển thị được (fallback)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { commentNotifText } from "@/lib/rich-content";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { notificationCutoffISO } from "@/lib/notifications-retention";
import { ResetCountdownBanner } from "@/components/candy/reset-countdown";

import { onNotificationEvent } from "@/lib/notification-realtime";
import { useAuth } from "@/components/candy/auth-provider";
import { formatRelativeTime } from "@/lib/time-format";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { refreshInventory } from "@/components/candy/inventory/InventorySheet";
import { flyDragonBallToInventory } from "@/components/candy/gift/dragon-ball-fly";
import { flyCoinsToWallet, showCoinGain } from "@/lib/gift-fx";
import { dedupeNotifications } from "@/lib/notification-dedupe";

/* ------------------------------------------------------------------ */
const NOTIFICATION_COLUMNS =
  "id, user_id, type, kind, entity_type, entity_id, actor_ids, actors_count, last_actor_id, title, message, link, is_read, is_pending_claim, created_at, updated_at, data";

type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  kind: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_ids: string[] | null;
  actors_count: number | null;
  last_actor_id: string | null;
  title: string | null;
  message: string | null;
  link: string | null;
  is_read: boolean;
  is_pending_claim?: boolean | null;
  created_at: string;
  updated_at: string;
  data: any;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
};

// Chỉ giữ những loại notification này. Bỏ hoàn toàn: like, follow, self-like,
// self-follow, chat message.
const ALLOWED_KINDS = new Set([
  "comment", "comment_reply",
  "gift_post", "gift_v1",
  "dragon_reward",
  "wallet_transfer", "transfer_pending",
  "admin_trust_adjust", "admin_trust_penalty",
  "system", "admin_broadcast", "announcement", "maintenance", "admin_message",
]);

const DRAGON_BALL_TIERS = new Set([1, 2, 3, 4, 5, 6, 7]);
const INVENTORY_CHANGED_EVENT = "dbq:inventory-changed";

const SYSTEM_KINDS = new Set([
  "system", "admin_broadcast", "announcement", "maintenance", "admin_message",
  "admin_trust_adjust", "admin_trust_penalty",
]);

function isAllowed(n: NotifRow): boolean {
  const k = (n.kind || n.type || "").toLowerCase();
  return ALLOWED_KINDS.has(k);
}

function isPendingDragonBall(n: NotifRow): boolean {
  const tier = Number(n.data?.ball_tier ?? 0);
  return (n.kind || n.type || "").toLowerCase() === "gift_post"
    && DRAGON_BALL_TIERS.has(tier)
    && n.data?.claimed !== true
    && n.data?.status !== "claimed";
}

/** Quà bài viết (Gift System V2) chưa được Nhận → phải hiện nút Claim. */
function postGiftId(n: NotifRow): string | null {
  const k = (n.kind || n.type || "").toLowerCase();
  if (k !== "gift_post" && k !== "gift_v1") return null;
  const id = n.data?.gift_id ?? n.data?.post_gift_id ?? null;
  return id ? String(id) : null;
}

function isPendingPostGift(n: NotifRow): boolean {
  if (!postGiftId(n)) return false;
  const tier = Number(n.data?.ball_tier ?? 0);
  if (DRAGON_BALL_TIERS.has(tier)) return false;
  return n.data?.claimed !== true && n.data?.status !== "claimed";
}

function isPendingTransfer(n: NotifRow): boolean {
  return (n.kind || n.type || "").toLowerCase() === "transfer_pending"
    && n.data?.claimed !== true
    && n.data?.status !== "claimed";
}

function isPendingEnvelope(n: NotifRow): boolean {
  return (n.kind || n.type || "").toLowerCase() === "dragon_reward"
    && n.data?.claimed !== true
    && n.data?.status !== "claimed";
}

function safeAmount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const cleaned = String(raw).replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nameOf(id: string | null | undefined, map: Record<string, ProfileLite>) {
  if (!id) return "Ai đó";
  const p = map[id];
  return p?.full_name || p?.username || "Ai đó";
}

/* ------------------------------------------------------------------ */
interface Props {
  open: boolean;
  onClose: () => void;
  onOpenChat: (userId: string) => void;
  onOpenPost: (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => void;
  onOpenVideo?: (videoId: string) => void;
  onConfirmCandy: (info: { senderId: string; senderName?: string; amount: number }) => void;
  onOpenFollowers?: () => void;
}

export function NotificationsPanel({
  open, onClose, onOpenPost, onOpenVideo,
}: Props) {
  const { me, setGemBalance, refreshMe } = useAuth();

  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(false);
  const [claimingAll, setClaimingAll] = useState(false);


  /* ---------------- Load ---------------- */
  const loadAll = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", me.id)
      .eq("is_read", false)
      .gte("created_at", notificationCutoffISO())
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { setLoading(false); return; }
    const rows = (data || []) as NotifRow[];

    // CHỈ giữ các loại được cho phép (comment, reply, wallet_transfer,
    // admin trust adjust, system). Loại bỏ hoàn toàn: like, follow,
    // self-like, self-follow, chat message.
    const filtered = rows.filter((n) => {
      if (!isAllowed(n)) return false;
      // Bỏ self (actor == me).
      if (n.last_actor_id && n.last_actor_id === me.id) return false;
      // Luồng "tặng Ngọc Rồng" KHÔNG được xuất hiện dưới dạng notification
      // Gem. Nếu bản ghi có ball_tier 1..7 và không phải type gift_post thì
      // đây là bản ghi phụ (wallet_transfer/gem_received) sinh ra bởi giao
      // dịch nội bộ — bỏ hoàn toàn để không hiện "đã chuyển Gem".
      const tier = Number(n.data?.ball_tier ?? 0);
      const k = (n.kind || n.type || "").toLowerCase();
      if (tier >= 1 && tier <= 7 && k !== "gift_post") return false;
      return true;
    });

    setNotifs(dedupeNotifications(filtered));

    const ids = new Set<string>();
    for (const n of filtered) {
      const list = (n.actor_ids || []).slice(0, 3);
      for (const a of list) if (a) ids.add(a);
      if (n.last_actor_id) ids.add(n.last_actor_id);
      const sender = n.data?.sender_id || n.data?.from_user_id;
      if (sender) ids.add(String(sender));
    }
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
        .in("id", Array.from(ids));
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      setProfilesMap(map);
    } else {
      setProfilesMap({});
    }
    setLoading(false);
  }, [me?.id]);

  useEffect(() => { if (open) void loadAll(); }, [open, loadAll]);

  useEffect(() => {
    if (!open || !me?.id) return;
    const off = onNotificationEvent(me.id, () => void loadAll());
    return () => { off(); };
  }, [open, me?.id, loadAll]);

  const current = notifs;
  const pendingGiftCount = useMemo(() => current.filter((n) => isPendingPostGift(n)).length, [current]);


  /* ---------------- Mutations ---------------- */
  const markReadAndDismiss = async (id: string) => {
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    await supabase.rpc("notif_mark_read" as any, { p_id: id } as any);
  };

  const removeRow = async (id: string) => {
    const row = current.find((n) => n.id === id);
    if (row && (isPendingPostGift(row) || isPendingDragonBall(row) || isPendingEnvelope(row) || isPendingTransfer(row))) {
      toast.error("Hãy nhận quà trước khi xoá thông báo này.");
      return;
    }
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const clearAll = async () => {
    if (!me?.id) return;
    const removable = current
      .filter((n) => !n.is_pending_claim && !isPendingPostGift(n) && !isPendingDragonBall(n) && !isPendingEnvelope(n))
      .map((n) => n.id);
    if (removable.length === 0) return;
    setNotifs((prev) => prev.filter((n) => !removable.includes(n.id)));
    await supabase.from("notifications").delete().in("id", removable);
    toast.success("Đã xoá toàn bộ thông báo.");
  };

  /* ---------------- Navigation ---------------- */
  const claimDragonBall = async (
    n: NotifRow,
    fromRect?: DOMRect,
  ) => {
    const ballTier = Number(n.data?.ball_tier ?? 0);
    if (!DRAGON_BALL_TIERS.has(ballTier)) return;

    const { data: result, error } = await supabase.rpc("claim_dragon_ball_gift" as any, { p_notif_id: n.id });
    console.log("RPC OK", { result, error });
    if (error || !(result as any)?.ok) {
      toast.error((result as any)?.message || "Không thể nhận Ngọc Rồng.");
      return;
    }

    // Hiệu ứng: viên Ngọc bay từ vị trí nút Nhận về icon Rương.
    if (fromRect) {
      flyDragonBallToInventory(ballTier, {
        x: fromRect.left + fromRect.width / 2,
        y: fromRect.top + fromRect.height / 2,
      });
    }
    // Cập nhật Rương ngay (không mở popup, không redirect).
    refreshInventory();
    window.setTimeout(() => refreshInventory(), 400);
    await loadAll();
    // Toast xác nhận SAU khi hiệu ứng chạy xong.
    window.setTimeout(() => {
      toast.success(`Bạn đã nhận được Ngọc Rồng ${ballTier} Sao`);
    }, 900);
  };

  const claimPostGift = async (n: NotifRow, fromRect?: DOMRect) => {
    const giftId = postGiftId(n);
    if (!giftId) return;
    const { data: result, error } = await supabase.rpc("claim_post_gift" as any, { p_gift_id: giftId });
    const res: any = result;
    if (error || !res?.ok) {
      toast.error(res?.message || "Không thể nhận quà.");
      if (res?.code === "ALREADY_CLAIMED") await loadAll();
      return;
    }
    // Đánh dấu đã nhận ngay trên UI (ẩn nút Claim, hiện "✅ Đã nhận").
    setNotifs((prev) =>
      prev.map((row) =>
        row.id === n.id
          ? { ...row, is_read: true, data: { ...(row.data || {}), claimed: true, status: "claimed" } }
          : row,
      ),
    );
    const amount = Number(res.amount) || 0;
    const origin = fromRect
      ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 }
      : { x: window.innerWidth / 2, y: 120 };
    flyCoinsToWallet(origin);
    showCoinGain(amount);
    // Ví chỉ tăng sau khi xu bay tới, rồi mới toast.
    window.setTimeout(() => {
      if (Number.isFinite(Number(res.new_balance))) setGemBalance(Number(res.new_balance));
      void refreshMe();
    }, 620);
    window.setTimeout(() => {
      toast.success(`Đã nhận ${amount.toLocaleString("vi-VN")} xu`);
    }, 1000);

  };

  /**
   * Nhận tất cả — claim mọi món quà bài viết chưa nhận theo batch,
   * cộng xu đúng 1 lần, chỉ 1 hiệu ứng xu bay dù có bao nhiêu quà.
   */
  const claimAll = async (fromRect?: DOMRect) => {
    if (claimingAll) return;
    const pending = current.filter((n) => isPendingPostGift(n));
    if (pending.length === 0) return;
    setClaimingAll(true);

    let total = 0;
    let latestBalance: number | null = null;
    const claimedIds: string[] = [];

    for (const n of pending) {
      const giftId = postGiftId(n);
      if (!giftId) continue;
      const { data: result, error } = await supabase.rpc("claim_post_gift" as any, { p_gift_id: giftId });
      const res: any = result;
      if (error || !res?.ok) continue;
      total += Number(res.amount) || 0;
      if (Number.isFinite(Number(res.new_balance))) latestBalance = Number(res.new_balance);
      claimedIds.push(n.id);
    }

    // 1) Quà biến mất khỏi danh sách (đánh dấu đã nhận, realtime, không reload).
    setNotifs((prev) =>
      prev.map((row) =>
        claimedIds.includes(row.id)
          ? { ...row, is_read: true, data: { ...(row.data || {}), claimed: true, status: "claimed" } }
          : row,
      ),
    );

    if (claimedIds.length === 0) {
      setClaimingAll(false);
      toast.error("Không thể nhận quà.");
      return;
    }

    // 2) Xu bay về ví (1 animation duy nhất).
    const origin = fromRect
      ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 }
      : { x: window.innerWidth / 2, y: 120 };
    flyCoinsToWallet(origin, 12);
    showCoinGain(total);

    // 3) Ví tăng sau khi xu bay tới.
    window.setTimeout(() => {
      if (latestBalance != null) setGemBalance(latestBalance);
      void refreshMe();
    }, 620);

    // 4) Toast tổng kết.
    window.setTimeout(() => {
      toast.success(`Đã nhận ${total.toLocaleString("vi-VN")} xu`);
      setClaimingAll(false);
    }, 1000);
  };


  const claimTransfer = async (n: NotifRow, fromRect?: DOMRect) => {
    const id = n.data?.transfer_id;
    if (!id) return;
    const { data: result, error } = await supabase.rpc("claim_transfer" as any, { p_transfer_id: String(id) });
    const res: any = result;
    if (error || !res?.ok) {
      toast.error(res?.message || "Không thể nhận xu.");
      if (res?.code === "ALREADY_CLAIMED") await loadAll();
      return;
    }
    setNotifs((prev) => prev.map((row) => (row.id === n.id
      ? { ...row, is_read: true, data: { ...(row.data || {}), claimed: true, status: "claimed" } }
      : row)));
    const amount = Number(res.amount) || 0;
    const origin = fromRect
      ? { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 }
      : { x: window.innerWidth / 2, y: 120 };
    flyCoinsToWallet(origin);
    showCoinGain(amount);
    window.setTimeout(() => {
      if (Number.isFinite(Number(res.new_balance))) setGemBalance(Number(res.new_balance));
      void refreshMe();
    }, 620);
    window.setTimeout(() => toast.success(`Đã nhận ${amount.toLocaleString("vi-VN")} xu`), 1000);
  };

  const claimEnvelope = async (n: NotifRow) => {
    const { data: result, error } = await supabase.rpc("claim_summon_envelope" as any, { p_notif_id: n.id });
    if (error || !(result as any)?.ok) {
      toast.error("Không thể mở Bao Lì Xì.");
      return;
    }
    await loadAll();
    toast.success("Bạn nhận được Bao Lì Xì");
  };

  useEffect(() => {
    if (!open) return;
    const claimExpired = () => {
      const now = Date.now();
      current.forEach((n) => {
        if (!isPendingEnvelope(n)) return;
        const expiresAt = n.data?.expires_at
          ? new Date(n.data.expires_at).getTime()
          : new Date(n.created_at).getTime() + 5 * 60_000;
        if (expiresAt <= now) void claimEnvelope(n);
      });
    };
    claimExpired();
    const timer = window.setInterval(claimExpired, 30_000);
    return () => window.clearInterval(timer);
  }, [open, current]);

  const handleClick = (n: NotifRow) => {
    const k = (n.kind || n.type || "").toLowerCase();
    const d = n.data || {};

    if (isPendingDragonBall(n) || isPendingEnvelope(n) || isPendingPostGift(n) || isPendingTransfer(n)) return;

    void markReadAndDismiss(n.id);

    if (k === "follow") {
      const uid = n.last_actor_id || d.follower_id || d.actor_id;
      if (uid) window.dispatchEvent(new CustomEvent("app:view-profile", { detail: { userId: uid } }));
      onClose();
      return;
    }
    if (k === "like") {
      const pid = d.post_id || n.entity_id;
      if (pid) { onOpenPost(String(pid)); onClose(); return; }
    }
    if (k === "comment" || k === "comment_reply") {
      const pid = d.post_id;
      const cid = d.comment_id || n.entity_id;
      if (pid) { onOpenPost(String(pid), { focusComments: true, commentId: cid ? String(cid) : undefined }); onClose(); return; }
    }
    if (k === "wallet_transfer") {
      window.dispatchEvent(new CustomEvent("app:open-wallet"));
      onClose();
      return;
    }
    if (k === "gift_video" || k === "video_comment") {
      const vid = d.video_id;
      if (vid && onOpenVideo) { onOpenVideo(String(vid)); onClose(); return; }
    }
    onClose();
  };

  /* ---------------- Modal lifecycle ---------------- */
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Task #5.3: ẩn Bottom Dock khi popup thông báo mở.
    const prev = document.body.getAttribute("data-modal-open");
    document.body.setAttribute("data-modal-open", "true");
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev) document.body.setAttribute("data-modal-open", prev);
      else document.body.removeAttribute("data-modal-open");
    };
  }, [open, onClose]);

  /* ---------------- Render ---------------- */
  const empty = !loading && current.length === 0;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Thông báo"
            style={{
              position: "fixed", inset: 0, zIndex: 10010,
              background: "transparent",
            }}
          >
            <motion.div
              key="notif-panel"
              role="dialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -6 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="notif-panel"
              style={{
                position: "fixed",
                top: "calc(env(safe-area-inset-top, 0px) + 64px)",
                right: "max(12px, env(safe-area-inset-right, 0px))",
                left: "auto",
                width: "min(400px, calc(100vw - 24px))",
                maxHeight: "min(72vh, 640px)",
                background: "#fff",
                color: "#171717",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                boxShadow: "0 12px 32px -16px rgba(0,0,0,0.28)",
                display: "flex", flexDirection: "column", overflow: "hidden",
                transformOrigin: "top right",
              }}
            >
              {/* Header — 1 hàng gọn, giống Facebook/Threads */}
              <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-semibold leading-tight">Thông báo</h3>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {notifs.length > 0 ? `${notifs.length} thông báo mới` : "Bạn không có thông báo mới"}
                  </p>
                </div>
                {pendingGiftCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      void claimAll(rect);
                    }}
                    disabled={claimingAll}
                    className="shrink-0 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                  >
                    🎁 Nhận tất cả
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  disabled={loading || current.length === 0}
                  className="shrink-0 whitespace-nowrap rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  Xoá tất cả
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X size={16} />
                </button>
              </div>

              {/* MESSAGE SYSTEM V2 — dữ liệu chat/thông báo tự làm mới mỗi 72 giờ */}
              <ResetCountdownBanner />


              {/* Body — 1 danh sách duy nhất, không tabs */}
              <div
                data-scroll-lock-ignore
                className="flex-1 px-3 py-2"
                style={{
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                  touchAction: "pan-y",
                }}
              >

                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải…
                  </div>
                ) : empty ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <p className="text-xs">Bạn không có thông báo mới.</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    <AnimatePresence initial={false}>
                      {current.map((n) => {
                        const k = (n.kind || n.type || "").toLowerCase();
                        const isSystem = SYSTEM_KINDS.has(k);
                        return (
                          <motion.li
                            key={n.id}
                            layout
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.18 }}
                          >
                            {isSystem
                              ? <SystemRow n={n}
                                  onDismiss={() => void removeRow(n.id)} />
                              : <InteractionRow n={n} profilesMap={profilesMap}
                                  onClick={() => handleClick(n)}
                                  onClaim={(rect) =>
                                    isPendingTransfer(n)
                                      ? void claimTransfer(n, rect)
                                      : isPendingDragonBall(n)
                                      ? void claimDragonBall(n, rect)
                                      : isPendingPostGift(n)
                                        ? void claimPostGift(n, rect)
                                        : void claimEnvelope(n)}
                                  onDismiss={() => void removeRow(n.id)} />}
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ============ Row components ============ */
function AvatarStack({ ids, profilesMap, size = 32 }: {
  ids: string[]; profilesMap: Record<string, ProfileLite>; size?: number;
}) {
  const shown = ids.slice(0, 3);
  return (
    <div className="relative shrink-0" style={{ width: size + (shown.length - 1) * 14, height: size }}>
      {shown.map((id, i) => {
        const p = profilesMap[id];
        const src = p?.avatar;
        const initial = (p?.full_name || p?.username || "?").trim().slice(0, 1).toUpperCase();
        return (
          <div
            key={id}
            className="absolute overflow-hidden rounded-full bg-muted border-2 border-card"
            style={{ width: size, height: size, left: i * 14, zIndex: 10 - i }}
          >
            <AvatarGlow
              avatar={src ?? null}
              userId={id}
              size={size}
              alt=""
              fallback={<span className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">{initial}</span>}
            />
          </div>
        );
      })}
    </div>
  );
}

function InteractionRow({ n, profilesMap, onClick, onClaim, onDismiss }: {
  n: NotifRow;
  profilesMap: Record<string, ProfileLite>;
  onClick: () => void;
  onClaim: (rect?: DOMRect) => void;
  onDismiss: () => void;
}) {
  const k = (n.kind || n.type || "").toLowerCase();
  const d = n.data || {};
  const actorIds = (n.actor_ids && n.actor_ids.length
    ? n.actor_ids
    : [n.last_actor_id || d.sender_id || d.from_user_id].filter(Boolean)) as string[];
  const total = n.actors_count || actorIds.length || 1;
  const firstName = nameOf(actorIds[0], profilesMap);
  const secondName = actorIds[1] ? nameOf(actorIds[1], profilesMap) : null;
  const others = Math.max(0, total - (secondName ? 2 : 1));

  let primary = "";
  let secondary: string | null = null;
  const pendingDragonBall = isPendingDragonBall(n);
  const pendingEnvelope = isPendingEnvelope(n);
  const pendingPostGift = isPendingPostGift(n);
  const pendingTransfer = isPendingTransfer(n);
  const giftAmount = safeAmount(d.amount ?? d.gift_amount);
  const giftName = d.gift_name || d.giftName || null;
  const giftEmoji = d.emoji || d.gift_emoji || "🎁";

  const namesLine = () => {
    if (secondName && others > 0) return `${firstName}, ${secondName} và ${others} người khác`;
    if (secondName)                return `${firstName} và ${secondName}`;
    return firstName;
  };

  if (k === "comment") {
    const t = commentNotifText(firstName, d.comment_text ?? d.text ?? d.comment ?? null, "post");
    primary = t.primary;
    secondary = t.secondary;
  } else if (k === "comment_reply") {
    const t = commentNotifText(firstName, d.comment_text ?? d.text ?? d.comment ?? null, "comment");
    primary = t.primary;
    secondary = t.secondary;
  } else if (k === "wallet_transfer" && !DRAGON_BALL_TIERS.has(Number(d.ball_tier || 0))) {
    const amt = safeAmount(d.amount);
    primary = amt > 0
      ? `${firstName} đã chuyển cho bạn ${amt.toLocaleString("vi-VN")} Gem`
      : `${firstName} đã gửi cho bạn một khoản Gem.`;
    if (d.note) secondary = `"${String(d.note).slice(0, 160)}"`;
  } else if (k === "gift_post" || k === "gift_v1") {
    const tier = Number(d.ball_tier || 0);
    if (tier) {
      primary = `Bạn nhận được Ngọc Rồng ${tier} Sao`;
      secondary = `${firstName} vừa tặng bạn Ngọc Rồng ${tier} Sao.`;
    } else {
      primary = `${firstName} đã tặng bạn`;
      secondary = null;
    }
  } else if (k === "transfer_pending") {
    const amt = safeAmount(d.amount);
    primary = `💸 ${firstName} đã chuyển ${amt.toLocaleString("vi-VN")} xu`;
    secondary = pendingTransfer ? "Bấm Nhận để cộng xu vào ví." : "Đã nhận";
  } else if (k === "dragon_reward") {
    primary = "Bạn nhận được Bao Lì Xì";
    secondary = pendingEnvelope ? "Bao Lì Xì Rồng Thần" : "Đã mở";
  } else if (k === "admin_trust_adjust" || k === "admin_trust_penalty") {
    primary = n.title || n.message || "Admin đã điều chỉnh uy tín của bạn.";
    if (n.message && n.title) secondary = n.message;
  } else {
    primary = n.title || n.message || "Thông báo mới";
  }

  // Tách "Tên người dùng" ra khỏi câu nội dung để hiển thị kiểu Facebook/Threads:
  //   Nguyễn Văn A            (in đậm)
  //   đã bình luận ...        (nhỏ hơn)
  //   2 giờ trước             (xám)
  const nameLine = namesLine();
  const actionLine = primary.startsWith(nameLine)
    ? primary.slice(nameLine.length).trim()
    : primary.startsWith(firstName)
      ? primary.slice(firstName.length).trim()
      : primary;
  const showNameLine = actionLine !== primary;

  return (
    <div
      onClick={pendingDragonBall || pendingEnvelope || pendingPostGift || pendingTransfer ? undefined : onClick}
      className="group relative flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors hover:bg-gray-50"
    >
      {actorIds.length > 0 ? (
        <AvatarStack ids={actorIds} profilesMap={profilesMap} size={32} />
      ) : null}
      <div className="min-w-0 flex-1 pr-5">
        {showNameLine ? (
          <p className="flex flex-wrap items-center gap-1 text-[13.5px] font-bold leading-tight text-gray-950">
            <span className="truncate">{nameLine}</span>
            {actorIds[0] && profilesMap[actorIds[0]] ? (
              <UniversalBadge profile={profilesMap[actorIds[0]] as any} />
            ) : null}
          </p>
        ) : null}
        <p
          className={
            showNameLine
              ? "mt-0.5 text-[12.5px] leading-[1.35] text-gray-700"
              : "flex flex-wrap items-center gap-1 text-[13.5px] font-bold leading-tight text-gray-950"
          }
        >
          {!showNameLine && actorIds[0] && profilesMap[actorIds[0]] ? (
            <UniversalBadge profile={profilesMap[actorIds[0]] as any} />
          ) : null}
          <span>{actionLine}</span>
        </p>
        {secondary && (
          <p className="mt-0.5 line-clamp-2 text-[12px] italic leading-[1.35] text-gray-500">{secondary}</p>
        )}
        {(k === "gift_post" || k === "gift_v1") && !Number(d.ball_tier || 0) ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[18px] leading-none" aria-hidden>{giftEmoji}</span>
            <span className="min-w-0">
              {giftName ? (
                <span className="block truncate text-[12.5px] font-bold text-gray-900">{giftName}</span>
              ) : null}
              {giftAmount > 0 ? (
                <span className="block text-[12.5px] font-extrabold text-amber-600">
                  {giftAmount.toLocaleString("vi-VN")} xu
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
        {pendingEnvelope && <EnvelopeCountdown createdAt={n.created_at} expiresAt={d.expires_at} />}
        <p className="mt-1 text-[10.5px] leading-none text-gray-400">{formatRelativeTime(n.updated_at || n.created_at)}</p>
        {(pendingDragonBall || pendingEnvelope || pendingPostGift || pendingTransfer) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onClaim(rect);
            }}
            style={{ height: 34 }}
            className={
              pendingPostGift || pendingTransfer
                ? "mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 px-3 text-[12px] font-extrabold text-white shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
                : "mt-2 inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 text-[12px] font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
            }
          >
            {pendingTransfer ? "Nhận" : pendingPostGift ? "🎁 Nhận quà" : pendingDragonBall ? "Nhận" : "Mở ngay"}
          </button>
        )}

        {!pendingDragonBall && !pendingPostGift && (k === "gift_post" || k === "gift_v1") && (
          <p className="mt-2 text-xs font-medium text-emerald-600">✅ Đã nhận</p>
        )}
      </div>

      {!n.is_read && (
        <span className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Chưa đọc" />
      )}
      {!pendingDragonBall && !pendingEnvelope && !pendingPostGift && !pendingTransfer && <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Xoá"
        className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
      >
        <X size={12} />
      </button>}
    </div>
  );
}

function SystemRow({ n, onDismiss }: { n: NotifRow; onDismiss: () => void }) {
  return (
    <div className="group relative flex items-start rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        {n.title && <p className="text-sm font-semibold leading-snug">{n.title}</p>}
        {n.message && <p className="text-sm text-muted-foreground leading-snug">{n.message}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(n.updated_at || n.created_at)}</p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Xoá"
        className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function EnvelopeCountdown({ createdAt, expiresAt }: { createdAt: string; expiresAt?: string }) {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : new Date(createdAt).getTime() + 5 * 60_000;
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, deadline - Date.now())), 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const seconds = Math.ceil(remaining / 1_000);
  return <p className="mt-2 font-mono text-sm font-semibold text-gray-900">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p>;
}

/* ------------------------------------------------------------------ */
/**
 * Badge counter — chỉ đếm rows chưa đọc (is_read = false) của user hiện
 * tại. Realtime: mọi INSERT / UPDATE trên bảng notifications thuộc user
 * đều trigger refresh (không refetch full list).
 */
export function useUnreadNotifications() {
  const { me } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!me?.id) { setCount(0); return; }
    // Task #5.3: badge = số notification chưa đọc HIỂN THỊ trong panel
    // → đồng bộ tuyệt đối với danh sách. Loại các loại chat message.
    const { count: c } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.id)
      .eq("is_read", false)
      .gte("created_at", notificationCutoffISO())
      .not("type", "in", '("message","chat_message","dm","like","like_post","post_like")')
      .not("kind", "in", '("like","like_post","post_like")');
    setCount(c || 0);
  }, [me?.id]);

  useEffect(() => {
    void refresh();
    if (!me?.id) return;
    const off = onNotificationEvent(me.id, () => void refresh());
    return () => { off(); };
  }, [me?.id, refresh]);

  return { count, refresh };
}
