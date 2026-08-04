import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Bell, Heart, MessageCircle, UserPlus, Megaphone,
  X, Sparkles, Loader2, Coins,
} from "lucide-react";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { notificationCutoffISO, purgeOldNotifications } from "@/lib/notifications-retention";
import { onNotificationEvent } from "@/lib/notification-realtime";
import { formatRelativeTime } from "@/lib/time-format";
import { followUser, useIsFollowing } from "@/lib/follow-actions";
import { refreshInventory } from "@/components/candy/inventory/InventorySheet";
import { flyDragonBallToInventory } from "@/components/candy/gift/dragon-ball-fly";
import { commentNotifText } from "@/lib/rich-content";

type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string | null;
  is_read: boolean;
  is_claimed?: boolean | null;
  is_pending_claim?: boolean | null;
  created_at: string;
  data: any;
};
type ProfileLite = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
};



const COMMENT_TYPES = new Set([
  "comment_post","comment_video","comment","new_comment",
  "post_comment","video_comment",
]);
const REPLY_TYPES = new Set(["reply","comment_reply"]);
const FOLLOW_TYPES = new Set(["follow", "new_follower"]);
const LIKE_TYPES = new Set(["like","like_post","like_video"]);
const GEM_TYPES = new Set([
  "gift_post","gift_video","candy_transfer","gem_transfer","gem_received","dragon_reward",
]);
const INTERACTION_TYPES = new Set([
  ...COMMENT_TYPES, ...REPLY_TYPES, ...GEM_TYPES,
]);
const SYSTEM_TYPES = new Set([
  "system","admin_broadcast","announcement","maintenance","admin_message",
]);

function isPendingDragonBall(n: NotifRow): boolean {
  const tier = Number(n.data?.ball_tier || 0);
  return n.type === "gift_post" && tier >= 1 && tier <= 7
    && n.data?.claimed !== true && n.data?.status !== "claimed";
}

function isPendingEnvelope(n: NotifRow): boolean {
  return n.type === "dragon_reward"
    && n.data?.claimed !== true && n.data?.status !== "claimed";
}

function isSystem(n: NotifRow): boolean {
  const k = String(n?.data?.kind || "").toLowerCase();
  const t = String(n?.type || "").toLowerCase();
  return SYSTEM_TYPES.has(k) || SYSTEM_TYPES.has(t);
}
function isInteraction(n: NotifRow): boolean {
  const k = String(n?.data?.kind || "").toLowerCase();
  const t = String(n?.type || "").toLowerCase();
  return INTERACTION_TYPES.has(k) || INTERACTION_TYPES.has(t) ||
    FOLLOW_TYPES.has(k) || FOLLOW_TYPES.has(t) ||
    LIKE_TYPES.has(k) || LIKE_TYPES.has(t);
}


function safeGemAmount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const cleaned = String(raw).replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function senderIdOf(n: NotifRow): string | null {
  const d = n.data || {};
  return (
    d.sender_id || d.actor_id || d.from_id || d.from_user_id ||
    d.commenter_id || d.user_id || null
  );
}

function Inner() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!me?.id) return;
    // Dọn thông báo quá 7 ngày (tối đa 1 lần/ngày/thiết bị) — không chặn UI.
    void purgeOldNotifications(me.id);
    setLoading(true);
    const { data: notifsData } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", me.id)
      .gte("created_at", notificationCutoffISO())
      .order("created_at", { ascending: false })
      .limit(150);
    let rows = (notifsData || []) as NotifRow[];
    rows = rows.filter((n) => {
      const t = String(n.type || "").toLowerCase();
      if (t === "message" || t === "chat_message" || t === "dm") return false;
      const d = n.data || {};
      // Không hiện notification Gem cho luồng tặng Ngọc Rồng.
      const tier = Number(d.ball_tier ?? 0);
      if (tier >= 1 && tier <= 7 && t !== "gift_post") return false;
      // Bỏ qua mọi notification Gem sinh ra từ giao dịch gift_dragon_ball
      // (trigger / realtime / bản ghi phụ). Người nhận chỉ nhận 1 viên Ngọc,
      // không nhận Gem, nên không được hiện "Ông Bụt đã chuyển cho bạn X Gem".
      const actionType = String(d.action_type || d.transaction_type || d.kind || "").toLowerCase();
      if (actionType === "gift_dragon_ball" && t !== "gift_post") return false;
      return true;
    });

    setNotifs(rows);

    const ids = new Set<string>();
    rows.forEach((n) => {
      const sid = senderIdOf(n);
      if (sid) ids.add(sid);
    });
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
        .in("id", Array.from(ids));
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      setProfilesMap(map);
    }
    setLoading(false);
  }, [me?.id]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!me?.id) return;
    const off = onNotificationEvent(me.id, () => { void loadAll(); });
    return () => { off(); };
  }, [me?.id, loadAll]);

  // PHẦN 6: gộp tất cả thông báo vào 1 danh sách duy nhất (bỏ tab),
  // vẫn gom nhóm follow/like theo actor để tránh spam.
  const items = useMemo(() => {
    const followSeen = new Map<string, NotifRow>();
    const likeAgg = new Map<string, NotifRow & { _likeCount?: number; _postIds?: Set<string> }>();
    const others: NotifRow[] = [];
    for (const n of notifs) {
      if (!isInteraction(n) && !isSystem(n)) continue;
      const t = String(n.type || "").toLowerCase();
      const actor = senderIdOf(n) || "";
      if (FOLLOW_TYPES.has(t) && actor) {
        const prev = followSeen.get(actor);
        if (!prev || prev.created_at < n.created_at) followSeen.set(actor, n);
        continue;
      }
      if (LIKE_TYPES.has(t) && actor) {
        const existing = likeAgg.get(actor);
        const pid = n.data?.post_id || n.data?.video_id || n.data?.target_id;
        if (existing) {
          existing._postIds = existing._postIds || new Set();
          if (pid) existing._postIds.add(String(pid));
          existing._likeCount = existing._postIds.size;
          if (n.created_at > existing.created_at) existing.created_at = n.created_at;
        } else {
          const seed: any = { ...n };
          seed._postIds = new Set(pid ? [String(pid)] : []);
          seed._likeCount = seed._postIds.size || 1;
          likeAgg.set(actor, seed);
        }
        continue;
      }
      others.push(n);
    }
    const all = [...others, ...followSeen.values(), ...likeAgg.values()];
    all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return all;
  }, [notifs]);

  const removeLocal = (id: string) =>
    setNotifs((prev) => prev.filter((n) => n.id !== id));

  const markReadAndRemove = async (n: NotifRow) => {
    removeLocal(n.id);
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    await supabase.from("notifications").delete().eq("id", n.id);
  };

  const clearAll = async () => {
    if (!me?.id) return;
    const removable = notifs
      .filter((n) => !n.is_pending_claim && !isPendingDragonBall(n) && !isPendingEnvelope(n))
      .map((n) => n.id);
    if (removable.length > 0) {
      await supabase.from("notifications").delete().in("id", removable);
    }
    toast.success("Đã xoá toàn bộ thông báo.");
    setNotifs((prev) => prev.filter((n) => !removable.includes(n.id)));
  };

  const handleInteractionClick = (n: NotifRow, fromRect?: DOMRect) => {
    const t = String(n.type || "").toLowerCase();

    const d = n.data || {};
    const postId = d.post_id || d.target_id || d.target_post_id;
    const videoId = d.video_id || d.target_video_id;
    const commentId = d.comment_id || d.reply_id || d.target_comment_id;
    const ballTier = Number(d.ball_tier) || 0;

    if (t === "gift_post" && ballTier >= 1 && ballTier <= 7 && !d.claimed) {
      void (async () => {
        console.log("notification", n);
        const { data: res, error } = await supabase.rpc("claim_dragon_ball_gift" as any, { p_notif_id: n.id });
          console.log("RPC OK", { result: res, error });
        const userId = me?.id;
        if (userId) {
          const test = await supabase
            .from("dragon_ball_instances" as any)
            .select("*")
            .eq("owner_id", userId);
          console.log("insert OK", !test.error);
          console.log("instances:", test.data ?? []);

          const inventory = await supabase
            .from("user_dragon_ball_inventory" as any)
            .select("*")
            .eq("user_id", userId);
          console.log("inventory loaded:", inventory.data ?? []);
        } else {
          console.log({ data: null, error: "NO_USER_ID_FOR_DEBUG" });
          console.log({ data: null, error: "NO_USER_ID_FOR_DEBUG" });
        }
        const ok = (res as any)?.ok;
        if (ok) {
          removeLocal(n.id);
          if (fromRect) {
            flyDragonBallToInventory(ballTier, {
              x: fromRect.left + fromRect.width / 2,
              y: fromRect.top + fromRect.height / 2,
            });
          }
          refreshInventory();
          setTimeout(() => refreshInventory(), 400);
          setTimeout(
            () => toast.success(`Bạn đã nhận được Ngọc Rồng ${ballTier} Sao`),
            900,
          );
        } else {
          toast.error((res as any)?.message || "Không thể nhận Ngọc Rồng. Thử lại nhé.");
        }
      })();
      return;
    }

    if (t === "dragon_reward" && !d.claimed) {
      removeLocal(n.id);
      void (async () => {
        const { data: res } = await supabase.rpc("claim_summon_envelope" as any, { p_notif_id: n.id });
        const r = (res as any) || {};
        if (r.ok) toast.success("Bạn nhận được Bao Lì Xì");
        else toast.error("Không thể mở Bao Lì Xì.");
      })();
      return;
    }

    if (COMMENT_TYPES.has(t) || REPLY_TYPES.has(t)) {
      if (postId) navigate(`/post/${postId}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ""}`);
      else if (videoId) navigate(`/video/${videoId}`);
    } else if (t === "like_milestone" && (d.post_id || postId)) {
      navigate(`/post/${d.post_id || postId}`);
    } else if (LIKE_TYPES.has(t) && postId) {
      navigate(`/post/${postId}`);
    } else if ((t === "post_locked" || t === "post_comments_disabled") && postId) {
      navigate(`/post/${postId}`);
    } else if (FOLLOW_TYPES.has(t)) {
      const sid = senderIdOf(n);
      if (sid) window.dispatchEvent(new CustomEvent("app:view-profile", { detail: { userId: sid } }));
    }

    void markReadAndRemove(n);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/95 px-3 py-3 backdrop-blur">
        <button type="button" onClick={() => navigate(-1)} aria-label="Quay lại"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          <h1 className="text-base font-semibold leading-none">Thông báo</h1>
        </div>
        <button
          type="button"
          onClick={() => void clearAll()}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Xoá tất cả
        </button>
      </header>

      <div className="mx-auto max-w-screen-sm px-2 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <Sparkles className="mb-3 h-10 w-10 opacity-50" />
            <p className="text-sm">Chưa có thông báo nào.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((n) => (
                <motion.li key={n.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                >
                  {isSystem(n) ? (
                    <SystemRow n={n} onDismiss={() => void markReadAndRemove(n)} />
                  ) : (
                    <InteractionRow n={n} profilesMap={profilesMap}
                      meId={me?.id || null}
                      onClick={(rect) => handleInteractionClick(n, rect)}
                      onDismiss={() => void markReadAndRemove(n)}
                    />
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

    </main>
  );
}

function Avatar({ src, name, size = 40 }: { src?: string | null; name?: string | null; size?: number }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}>
      {src ? <img loading="lazy" decoding="async" src={src} alt={name || ""} className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{initial}</span>}
    </div>
  );
}

function InteractionRow({ n, profilesMap, meId, onClick, onDismiss }: {
  n: NotifRow;
  profilesMap: Record<string, ProfileLite>;
  meId: string | null;
  onClick: (rect?: DOMRect) => void;
  onDismiss: () => void;
}) {
  const t = String(n.type || "").toLowerCase();
  const d = n.data || {};
  const sid = senderIdOf(n);
  const profile = sid ? profilesMap[sid] : null;
  const name = profile?.full_name || d.actor_name || d.sender_name || "Ai đó";
  const avatar = profile?.avatar || d.actor_avatar || d.sender_avatar;
  const isFollow = FOLLOW_TYPES.has(t);
  const isMilestone = t === "like_milestone";
  const isReply = REPLY_TYPES.has(t);
  const isComment = COMMENT_TYPES.has(t);
  const isLike = LIKE_TYPES.has(t);
  const isGem = GEM_TYPES.has(t);
  const pendingDragonBall = isPendingDragonBall(n);
  const pendingEnvelope = isPendingEnvelope(n);
  const commentText: string | null =
    d.comment_text || d.text || d.comment || d.body || null;
  const likeCount = (n as any)._likeCount as number | undefined;
  const gemAmount = safeGemAmount(d.amount);

  const [following, setFollowing] = useIsFollowing(meId, isFollow ? sid : null);

  let primary = "";
  let secondary: string | null = null;
  let Icon: any = MessageCircle;
  if (isMilestone) {
    Icon = Heart;
    primary = n.message || `Bài viết của bạn đã đạt ${d.milestone || ""} tym`;
  } else if (isReply) {
    Icon = MessageCircle;
    {
      const t = commentNotifText(name, commentText, "comment");
      primary = t.primary;
      secondary = t.secondary;
    }
  } else if (isComment) {
    Icon = MessageCircle;
    {
      const t = commentNotifText(name, commentText, "post");
      primary = t.primary;
      secondary = t.secondary;
    }
  } else if (isLike) {
    Icon = Heart;
    primary = likeCount && likeCount > 1
      ? `${name} đã thích ${likeCount} bài viết của bạn`
      : `${name} đã thích bài viết của bạn`;
  } else if (t === "dragon_reward") {
    primary = d.claimed ? "Bao Lì Xì Rồng Thần — Đã mở" : "Bạn nhận được Bao Lì Xì";
    secondary = "Bao Lì Xì Rồng Thần";
  } else if (isGem) {
    Icon = Coins;
    const tier = Number(d.ball_tier) || 0;
    if (tier >= 1 && tier <= 7) {
      primary = d.claimed ? `Bạn nhận được Ngọc Rồng ${tier} Sao — Đã nhận` : `Bạn nhận được Ngọc Rồng ${tier} Sao`;
      secondary = `${name} vừa tặng bạn Ngọc Rồng ${tier} Sao.`;
    } else if (!pendingDragonBall) {
      primary = gemAmount > 0
        ? `${name} đã chuyển cho bạn ${gemAmount.toLocaleString("vi-VN")} Gem`
        : `${name} đã gửi quà cho bạn`;
    }
    if (d.note) secondary = `"${String(d.note).slice(0, 140)}"`;
  } else if (isFollow) {
    Icon = UserPlus;
    primary = `${name} vừa yêu thích bạn`;
  } else {
    primary = n.title || n.message || "Thông báo";
  }

  const handleFollowBack = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!meId || !sid || following) return;
    setFollowing(true);
    try {
      await followUser(meId, sid);
      toast.success("💞 Đã yêu thích lại!");
    } catch {
      setFollowing(false);
      toast.error("Không thể yêu thích. Thử lại nhé.");
    }
  };

  const handleClaimClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onClick(rect);
  };
  return (
    <div
      onClick={pendingDragonBall || pendingEnvelope ? undefined : () => onClick()}
      className="group relative flex items-start rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      {!pendingDragonBall && !pendingEnvelope && (isMilestone ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/15 text-pink-500">
          <Heart size={20} fill="currentColor" />
        </div>
      ) : (
        <Avatar src={avatar} name={name} />
      ))}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          {!isMilestone && <span className="font-semibold">{name}</span>}
          {!isMilestone && " "}
          <span className="text-muted-foreground">{isMilestone ? primary : primary.replace(name, "").trim()}</span>
        </p>
        {secondary && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90 italic">{secondary}</p>
        )}
        {pendingEnvelope && <EnvelopeCountdown createdAt={n.created_at} expiresAt={d.expires_at} />}
        <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(n.created_at)}</p>
        {(pendingDragonBall || pendingEnvelope) && (
          <button type="button" onClick={handleClaimClick} className="mt-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm hover:bg-gray-50">
            {pendingDragonBall ? "Nhận" : "Mở ngay"}
          </button>
        )}
      </div>
      {isFollow && sid && !following && (
        <button type="button" onClick={handleFollowBack}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
          Yêu thích lại
        </button>
      )}
      {isFollow && sid && following && (
        <span className="shrink-0 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          Đã yêu thích
        </span>
      )}
      {!pendingDragonBall && !pendingEnvelope && <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Xoá"
        className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 text-muted-foreground hover:bg-muted">
        <X size={12} />
      </button>}
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

function SystemRow({ n, onDismiss }: { n: NotifRow; onDismiss: () => void }) {
  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-500">
        <Megaphone size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {n.title && <p className="text-sm font-semibold leading-snug">{n.title}</p>}
        {n.message && <p className="text-sm text-muted-foreground leading-snug">{n.message}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(n.created_at)}</p>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Xoá"
        className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 text-muted-foreground hover:bg-muted">
        <X size={12} />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Inner />
      </NotificationProvider>
    </AuthProvider>
  );
}
