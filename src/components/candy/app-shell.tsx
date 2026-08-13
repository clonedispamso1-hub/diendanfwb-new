import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { AppHeader } from "@/components/candy/app-header";
import { AuthScreen } from "@/components/candy/auth-screen";
import { SuspendedOverlay } from "@/components/candy/suspended-overlay";
import { BottomNav, type AppTab } from "@/components/candy/bottom-nav";
import { NotificationsPanel, useUnreadNotifications } from "@/components/candy/notifications-panel";
import { ProfileOverlay } from "@/components/candy/profile-overlay";

const ChatPage = lazyWithRetry(() => import("@/components/candy/chat-page").then(m => ({ default: m.ChatPage })));
const FeedPage = lazyWithRetry(() => import("@/components/candy/feed-page").then(m => ({ default: m.FeedPage })));
const FwbTinderPage = lazyWithRetry(() => import("@/components/candy/fwb-tinder-page").then(m => ({ default: m.FwbTinderPage })));
const PostDetailPage = lazyWithRetry(() => import("@/components/candy/post-detail-page").then(m => ({ default: m.PostDetailPage })));
const ProfilePage = lazyWithRetry(() => import("@/components/candy/profile-page").then(m => ({ default: m.ProfilePage })));
const LiveMocPage = lazyWithRetry(() => import("@/components/candy/live/live-moc-page").then(m => ({ default: m.LiveMocPage })));
const SecretConnectPage = lazyWithRetry(() => import("@/components/candy/secret-connect/secret-connect-page").then(m => ({ default: m.SecretConnectPage })));
// (Admin panel is now reached via Profile menu → /admin route, not the home tab)

import { Portal } from "@/components/candy/portal";
import { X, Crown } from "lucide-react";

import { NotificationProvider, useNotification } from "@/components/candy/notification-provider";
import { getMessagePreview } from "@/lib/message-preview";
import { ModerationPopupGate } from "@/components/candy/moderation-popup-gate";
import { PremiumOnboarding, needsPremiumOnboarding } from "@/components/candy/premium-onboarding";
import { DisplayNameGate, needsDisplayName } from "@/components/candy/display-name-gate";
import { supabase } from "@/lib/supabase";
import { useRealtime, pickNew } from "@/lib/realtime-registry";
import { useOnlineHeartbeat } from "@/lib/presence";
// V6 perf: các modal/widget không cần cho lần vẽ đầu → tách chunk, chỉ tải khi mở.
const TransferGemModal = lazyWithRetry(() => import("@/components/candy/transfer-gem-modal").then(m => ({ default: m.TransferGemModal })));
const RankingModal = lazyWithRetry(() => import("@/components/candy/ranking-modal").then(m => ({ default: m.RankingModal })));
const CreatePostView = lazyWithRetry(() => import("@/components/candy/create-post-view").then(m => ({ default: m.CreatePostView })));
const FloatingPetEgg = lazyWithRetry(() => import("@/components/candy/floating-pet-egg").then(m => ({ default: m.FloatingPetEgg })));
const FloatingBubbles = lazyWithRetry(() => import("@/components/candy/floating-bubbles").then(m => ({ default: m.FloatingBubbles })));
const FloatingAssistant = lazyWithRetry(() => import("@/components/candy/floating-assistant").then(m => ({ default: m.FloatingAssistant })));
import { useAssistantConfig } from "@/lib/assistant-config";
import { Button } from "@/components/ui/button";
// PHẦN 4: Bỏ popup "Bạn đang Top" — TopRankWatcher import removed.
import { LeaderboardBadgesProvider } from "@/components/candy/leaderboard-badges-provider";

/** Map URL pathname → AppTab.
 * Trang chủ (feed) là MẶC ĐỊNH ở "/". Tab "Tìm FWB" (swipe + onboarding)
 * nằm tại "/find-fwb" — chỉ vào tab này mới gating onboarding. */
function pathToTab(pathname: string): AppTab {
  // "/u/:id" = hồ sơ người khác dạng trang con → giữ nguyên tab phía dưới (Trang chủ).
  if (pathname.startsWith("/u/")) return "fwb";
  if (pathname.startsWith("/ket-noi-bi-mat")) return "connect";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/guide") || pathname.startsWith("/ket-noi") || pathname.startsWith("/huong-dan")) return "guide";
  if (pathname.startsWith("/connect") || pathname.startsWith("/pet") || pathname.startsWith("/taixiu")) return "fwb";
  if (pathname.startsWith("/find-fwb")) return "home"; // Tìm FWB (swipe)
  // "/", "/fwb", "/love" (legacy) → Trang chủ feed
  return "fwb";
}
function tabToPath(tab: AppTab): string {
  if (tab === "home") return "/find-fwb"; // Tìm FWB swipe
  if (tab === "guide") return "/guide";
  if (tab === "connect") return "/ket-noi-bi-mat";
  if (tab === "fwb") return "/"; // Trang chủ feed
  return `/${tab}`;
}

function CandyAppInner() {
  const { me, ready, isAdmin, logout } = useAuth();
  const { notify } = useNotification();
  useOnlineHeartbeat(me?.id);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const tab = pathToTab(location.pathname);
  // V6 — Bong bóng trợ lý: Trang chủ / Hồ sơ / Live / Wallet / Bài viết (Admin bật-tắt).
  const assistantCfg = useAssistantConfig();
  const showAssistant = (() => {
    if (!assistantCfg.enabled) return false;
    if (tab === "chat" || tab === "connect") return false;
    const path = location.pathname;
    if (path.startsWith("/post")) return assistantCfg.pages.post;
    if (path.startsWith("/wallet")) return assistantCfg.pages.wallet;
    if (path.startsWith("/live")) return assistantCfg.pages.live;
    if (tab === "profile") return assistantCfg.pages.profile;
    if (tab === "home" || tab === "fwb") return assistantCfg.pages.home;
    return false;
  })();
  const setTab = (next: AppTab) => navigate(tabToPath(next));

  // profileId / chatTargetId / postId được lấy từ URL params để F5 giữ nguyên
  const urlUserId = (params as { userId?: string; postId?: string }).userId || null;
  const urlPostId = (params as { postId?: string }).postId || null;
  // Tab "Hồ sơ" CHỈ dành cho chính mình. Hồ sơ người khác luôn là overlay "/u/:id".
  const isOverlayPath = location.pathname.startsWith("/u/");
  const profileId = null;
  const overlayUserId = isOverlayPath
    ? urlUserId
    : tab === "profile" && urlUserId && urlUserId !== me?.id
      ? urlUserId
      : null;
  const chatTargetId = tab === "chat" ? urlUserId : null;
  const openUserProfile = (id: string) => {
    if (!id) return;
    if (id === me?.id) { navigate("/profile"); return; }
    navigate(`/u/${id}`);
  };
  const closeUserProfile = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };
  const setChatTargetId = (id: string | null) => {
    if (id) navigate(`/chat/${id}`);
    else navigate("/chat");
  };

  const [unreadCount, setUnreadCount] = useState(0);
  const { count: notifUnread } = useUnreadNotifications();
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [highlightVideoId, setHighlightVideoId] = useState<string | null>(null);
  const [focusComments, setFocusComments] = useState(false);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [lastTrustScore, setLastTrustScore] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  

  // Lắng nghe yêu cầu mở popup Thông báo từ các trigger global (vd: nút Bell trong widget "Bóng bóng cute").
  useEffect(() => {
    const handler = () => setNotifOpen(true);
    window.addEventListener("app:open-notifications", handler);
    return () => window.removeEventListener("app:open-notifications", handler);
  }, []);

  // Lắng nghe yêu cầu xem profile từ các popup global (vd: Lobby Chat) → điều hướng full page
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string };
      if (detail?.userId) openUserProfile(detail.userId);
    };
    window.addEventListener("app:view-profile", handler as EventListener);
    return () => window.removeEventListener("app:view-profile", handler as EventListener);
  }, [navigate]);

  // Notification "wallet_transfer" → mở /wallet
  useEffect(() => {
    const handler = () => navigate("/wallet");
    window.addEventListener("app:open-wallet", handler);
    return () => window.removeEventListener("app:open-wallet", handler);
  }, [navigate]);

  // Bấm badge 🔴 LIVE ở bất kỳ đâu → chuyển sang tab Live Móc 🦋 (phòng sẽ tự cuộn tới).
  useEffect(() => {
    const handler = () => {
      setTab("guide");
      if (location.pathname !== "/") navigate("/");
    };
    window.addEventListener("app:open-live", handler as EventListener);
    return () => window.removeEventListener("app:open-live", handler as EventListener);
  }, [navigate, location.pathname]);

  // Lưu / khôi phục vị trí cuộn của .page-body theo pathname (tránh nhảy lên đầu khi back từ profile)
  // + Auto-hide Header/BottomNav khi cuộn xuống, hiện lại khi cuộn lên (đồng bộ, mượt).
  useEffect(() => {
    const key = `scroll:${location.pathname}`;
    const el = document.querySelector(".page-body") as HTMLElement | null;
    if (!el) return;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top)) {
        requestAnimationFrame(() => { el.scrollTop = top; });
      }
    }

    // Auto-hide Header/BottomNav on mobile (Facebook-style):
    // scroll down → hide, scroll up → show. Desktop luôn cố định.
    const autohideAllowed = window.matchMedia("(max-width: 767px)").matches;

    // Reset trạng thái ẩn mỗi khi đổi route để header luôn hiện lại khi vào màn mới.
    document.body.removeAttribute("data-nav-hidden");

    let lastY = el.scrollTop;
    let lastWinY = window.scrollY || 0;
    let ticking = false;
    const THRESHOLD = 6;
    const SHOW_TOP = 40;

    const update = () => {
      ticking = false;
      const cur = el.scrollTop;
      sessionStorage.setItem(key, String(cur));

      if (!autohideAllowed) return;
      if (
        document.body.hasAttribute("data-scroll-locked") ||
        document.body.style.overflow === "hidden"
      ) {
        return;
      }
      const winY = window.scrollY || 0;
      // Ưu tiên delta lớn hơn giữa .page-body và window (một số trang cuộn window)
      const dyEl = cur - lastY;
      const dyWin = winY - lastWinY;
      const dy = Math.abs(dyWin) > Math.abs(dyEl) ? dyWin : dyEl;
      const top = Math.max(cur, winY);
      if (Math.abs(dy) < THRESHOLD) {
        lastY = cur; lastWinY = winY; return;
      }
      if (top <= SHOW_TOP) {
        document.body.removeAttribute("data-nav-hidden");
      } else if (dy > 0) {
        document.body.setAttribute("data-nav-hidden", "true");
      } else {
        document.body.removeAttribute("data-nav-hidden");
      }
      lastY = cur;
      lastWinY = winY;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      document.body.removeAttribute("data-nav-hidden");
    };
  }, [location.pathname]);

  // Cảnh báo "Uy tín" đã được gỡ bỏ hoàn toàn khỏi UI.

  // Scroll & highlight when navigating to a target post/video
  useEffect(() => {
    if (!urlPostId) return;
    const search = new URLSearchParams(location.search);
    const commentId = search.get("comment") || search.get("commentId");
    setFocusComments(Boolean(commentId));
    setFocusCommentId(commentId);
    setHighlightPostId(urlPostId);
  }, [urlPostId, location.search]);

  useEffect(() => {
    if (highlightPostId && tab === "fwb") {
      const id = highlightPostId;
      const wantComments = focusComments;
      const wantCommentId = focusCommentId;
      const tryScroll = (attempt = 0) => {
        const el = document.getElementById(`post-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("is-highlighted");
          window.setTimeout(() => el.classList.remove("is-highlighted"), 2000);
          if (wantComments) {
            // On PostDetailPage (urlPostId set), comments are always rendered
            // inline — do NOT open the CommentSheet bottom sheet. Just scroll
            // to and highlight the target comment.
            const inDetail = Boolean(urlPostId);
            if (!inDetail) {
              const commentBtn = el.querySelector<HTMLButtonElement>(
                '[data-action="open-comments"]'
              );
              window.setTimeout(() => commentBtn?.click(), 350);
            }
            if (wantCommentId) {
              const scrollToComment = (tries = 0) => {
                const cEl = document.getElementById(`comment-${wantCommentId}`);
                if (cEl) {
                  cEl.scrollIntoView({ behavior: "smooth", block: "center" });
                  cEl.classList.add("comment-flash-highlight");
                  window.setTimeout(
                    () => cEl.classList.remove("comment-flash-highlight"),
                    3200,
                  );
                } else if (tries < 60) {
                  window.setTimeout(() => scrollToComment(tries + 1), 200);
                }
              };
              window.setTimeout(() => scrollToComment(), inDetail ? 400 : 700);
            }
          }

          setHighlightPostId(null);
          setFocusComments(false);
          setFocusCommentId(null);
        } else if (attempt < 50) {
          window.setTimeout(() => tryScroll(attempt + 1), 200);
        } else {
          setHighlightPostId(null);
          setFocusComments(false);
          setFocusCommentId(null);
        }
      };
      tryScroll();
    }
  }, [highlightPostId, tab, focusComments, focusCommentId, urlPostId]);

  useEffect(() => {
    if (highlightVideoId && tab === "fwb") {
      const id = highlightVideoId;
      const tryScroll = (attempt = 0) => {
        const el = document.getElementById(`video-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("is-highlighted");
          window.setTimeout(() => el.classList.remove("is-highlighted"), 2000);
          setHighlightVideoId(null);
        } else if (attempt < 10) {
          window.setTimeout(() => tryScroll(attempt + 1), 200);
        } else {
          setHighlightVideoId(null);
        }
      };
      tryScroll();
    }
  }, [highlightVideoId, tab]);

  const loadCounters = async () => {
    if (!me?.id) return;
    // Đếm tin nhắn chưa đọc — LOẠI TRỪ các message có created_at <= cleared_at
    // với sender tương ứng (user đã "Xoá cuộc trò chuyện").
    const [{ data: unreadMsgs }, { data: clears }] = await Promise.all([
      supabase
        .from("messages")
        .select("sender_id, created_at")
        .eq("receiver_id", me.id)
        .eq("is_read", false),
      supabase
        .from("conversation_clears" as any)
        .select("partner_id, cleared_at")
        .eq("user_id", me.id),
    ]);
    const clearedMap = new Map<string, number>();
    for (const c of ((clears as any[]) || [])) {
      clearedMap.set(c.partner_id, new Date(c.cleared_at).getTime());
    }
    let count = 0;
    for (const m of ((unreadMsgs as any[]) || [])) {
      const clearedAt = clearedMap.get(m.sender_id) ?? 0;
      const msgTs = new Date(m.created_at).getTime();
      if (clearedAt > 0 && msgTs <= clearedAt) continue;
      count++;
    }
    setUnreadCount(count);
    // notifUnread is now driven by useUnreadNotifications with panel dedup.
  };


  useEffect(() => { void loadCounters(); }, [me?.id, tab, notifOpen]);

  // Gộp cả 2 channel (tin nhắn + thông báo) của user hiện tại vào MỘT registry key
  // với filter server-side theo receiver_id/user_id — giảm số channel & egress.
  useRealtime(
    me?.id ? `app-shell-${me.id}` : null,
    [
      { table: "messages", event: "INSERT", filter: `receiver_id=eq.${me?.id}` },
      { table: "messages", event: "UPDATE", filter: `receiver_id=eq.${me?.id}` },
      { table: "messages", event: "DELETE", filter: `receiver_id=eq.${me?.id}` },
      { table: "notifications", event: "INSERT", filter: `user_id=eq.${me?.id}` },
    ],
    (payload, topicIndex) => {
      if (!me?.id) return;
      if (topicIndex === 0) {
        void (async () => {
          const msg = pickNew(payload) as any;
          if (!msg || msg.sender_id === me.id) return;
          const senderId = msg.sender_id as string;
          // Nếu user đã "Xoá cuộc trò chuyện" với sender và message này có
          // created_at <= cleared_at → bỏ qua hoàn toàn (không notify, không badge).
          try {
            const { data: clearRow } = await supabase
              .from("conversation_clears" as any)
              .select("cleared_at")
              .eq("user_id", me.id)
              .eq("partner_id", senderId)
              .maybeSingle();
            const clearedAt = clearRow ? new Date((clearRow as any).cleared_at).getTime() : 0;
            const msgTs = new Date(msg.created_at ?? Date.now()).getTime();
            if (clearedAt > 0 && msgTs <= clearedAt) return;
          } catch { /* ignore — thiếu bảng cũng không chặn notify */ }
          const { data: sender } = await supabase.from("profiles").select("full_name, username").eq("id", msg.sender_id).maybeSingle();
          const senderName = sender?.full_name || sender?.username || "Ai đó";
          notify({
            type: "message",
            title: "Tin nhắn mới 💬",
            message: `${senderName}: ${getMessagePreview(msg as any, false)}`,
            // Bấm banner → mở đúng cuộc trò chuyện. ChatPage sẽ load messages
            // đã được lọc bởi cleared_at, đánh dấu đã đọc trong openChat().
            onClick: () => {
              try {
                window.dispatchEvent(new CustomEvent("chat:reveal", { detail: { partnerId: senderId } }));
              } catch { /* ignore */ }
              navigate(`/chat/${senderId}`);
            },
          });
          setUnreadCount((v) => v + 1);
        })();
      } else if (topicIndex === 1 || topicIndex === 2) {
        // Đánh dấu đã đọc hoặc bị xoá → tính lại để badge có thể về 0.
        void loadCounters();
      } else if (topicIndex === 3) {
        void (async () => {
          const n = pickNew(payload) as { type: string; title: string | null; message: string | null; data?: any } | undefined;
          if (!n) return;
          const dragonTier = Number(n.data?.ball_tier || 0);
          // notifUnread refreshes itself via useUnreadNotifications realtime.
          // Popup nổi bật khi nhận Coin: "Bạn vừa nhận được [số lượng] kẹo từ [tên người gửi]!"
          if (n.type === "candy_transfer") {
            const data = (n.data && typeof n.data === "object") ? n.data : {};
            let amount: number | null = typeof data.amount === "number" ? data.amount : null;
            let senderName: string | null = typeof data.sender_name === "string" ? data.sender_name : null;
            // Fallback parse từ message: "Bạn nhận được 1.000 kẹo từ Tên ABC"
            if (n.message) {
              if (amount == null) {
                const m = n.message.match(/([\d.,]+)\s*(?:kẹo|coin)/i);
                if (m) amount = parseInt(m[1].replace(/[.,]/g, ""), 10);
              }
              if (!senderName) {
                const m = n.message.match(/từ\s+(.+?)$/i);
                if (m) senderName = m[1].trim();
              }
            }
            // Nếu vẫn thiếu sender, query nhanh từ data.sender_id
            if (!senderName && data.sender_id) {
              const { data: sender } = await supabase
                .from("profiles").select("full_name, username").eq("id", data.sender_id).maybeSingle();
              senderName = sender?.full_name || sender?.username || null;
            }
            const amountText = amount != null ? amount.toLocaleString("vi-VN") : "một ít";
            const fromText = senderName || "ai đó";
            toast.success(`🪙 Bạn vừa nhận được ${amountText} Coin từ ${fromText}!`, {
              description: "Mở Hộp thư để cảm ơn họ ngay nhé.",
              duration: 6000,
              className: "notif-candy-receive",
            });
          }
          // candy_transfer giờ do RealtimeToastBridge (gem_transactions) lo, tránh popup trùng.
          // Popup pink toast cho quà/tặng Gem/tặng Ngọc Rồng đã bị gỡ bỏ.
          // Các sự kiện này chỉ còn xuất hiện trong trang Thông báo.
        })();
      }
    },
  );

  const title = useMemo(() => {
    if (tab === "chat") return chatTargetId ? "Cuộc trò chuyện" : "Tin nhắn";
    if (tab === "profile") return profileId && profileId !== me?.id ? "Hồ sơ người dùng" : "Hồ sơ của tôi";
    if (tab === "fwb") return "Trang chủ";
    if (tab === "home") return "Tìm FWB";
    if (tab === "guide") return "Kết nối";
    if (tab === "connect") return "❤️ Kết Nối Bí Mật";
    return "Trang chủ";
  }, [chatTargetId, me?.id, profileId, tab, location.pathname]);

  // Popup VIP10 cho LIVE 18+
  const [showLiveVipGate, setShowLiveVipGate] = useState(false);
  // ESC để đóng + lock scroll khi popup mở
  useEffect(() => {
    if (!showLiveVipGate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowLiveVipGate(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showLiveVipGate]);
  // Legacy: /love đã gộp vào trang chủ 18+; các route cũ redirect về Live 18+ hoặc feed.
  useEffect(() => {
    if (!me) return;
    if (location.pathname === "/love") {
      navigate("/", { replace: true });
    }
    if (
      location.pathname.startsWith("/feedback") ||
      location.pathname.startsWith("/live18") ||
      location.pathname.startsWith("/important") ||
      location.pathname.startsWith("/quan-trong") ||
      location.pathname.startsWith("/huong-dan")
    ) {
      navigate("/guide", { replace: true });
    }
    if (
      location.pathname.startsWith("/connect") ||
      location.pathname.startsWith("/pet") ||
      location.pathname.startsWith("/taixiu")
    ) {
      navigate("/", { replace: true });
    }
  }, [me, location.pathname, navigate]);


  const goToPost = (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => {
    setFocusComments(!!opts?.focusComments || !!opts?.commentId);
    setFocusCommentId(opts?.commentId || null);
    setHighlightPostId(postId);
    const query = opts?.commentId ? `?comment=${encodeURIComponent(opts.commentId)}` : "";
    navigate(`/post/${postId}${query}`);
  };
  const goToVideo = (videoId: string) => {
    setHighlightVideoId(videoId);
    navigate("/"); // Video feed cũng ở "/"
  };

  if (!ready) return <main className="loading-screen">Đang tải ứng dụng...</main>;
  if (!me) return <AuthScreen />;

  // Khoá tài khoản: CHỈ dựa trên `status`. Admin luôn được bỏ qua.
  // trust_score chỉ là điểm uy tín, KHÔNG dùng để chặn đăng nhập.
  // Rule 2 tài khoản/thiết bị chỉ áp dụng khi ĐĂNG KÝ, không áp dụng khi đăng nhập.
  const meAny = me as typeof me & {
    status?: string | null;
    ban_reason?: string | null;
    full_name?: string | null;
    public_id?: string | number | null;
  };
  const status = meAny.status;
  const banned15Active =
    !isAdmin &&
    status === "banned_15" &&
    me.banned_until &&
    new Date(me.banned_until).getTime() > Date.now();
  const hardSuspended = !isAdmin && (status === "suspended" || status === "banned");

  if (hardSuspended || banned15Active) {
    const overlayMode: "suspended" | "banned_15" = banned15Active ? "banned_15" : "suspended";
    return (
      <SuspendedOverlay
        username={me.username}
        displayName={meAny.full_name || me.username}
        uid={meAny.public_id ?? me.id}
        onLogout={() => { void logout(); }}
        mode={overlayMode}
        reason={meAny.ban_reason}
        bannedUntil={me.banned_until}
      />
    );
  }

  // Onboarding bắt buộc: TOÀN BỘ chạy qua Premium Onboarding (10 bước + radar).
  // Form 4-bước cũ (OnboardingModal "Bước 1/4 Thông tin cơ bản") đã được DEPRECATE
  // hoàn toàn để tránh xung đột UX với flow mới.
  if (needsPremiumOnboarding(me)) {
    return <PremiumOnboarding />;
  }
  // Sau khi hoàn tất wizard, nếu user chưa có tên hiển thị (full_name) →
  // BẮT BUỘC nhập trước khi vào bất kỳ trang nào. Popup được overlay ĐÈ lên
  // giao diện app (Discord/FB style), không dùng early-return nữa để user
  // vẫn thấy website phía sau (nhưng không tương tác được).
  const showDisplayNameGate = needsDisplayName(me);

  // Ẩn header trắng khi đang trong màn hình nhắn tin chi tiết để tối đa không gian.
  // Trên mobile, ẩn luôn ở danh sách chat ("Tin nhắn") để tăng không gian hiển thị.
  const inChatDetail = tab === "chat" && !!chatTargetId;
  const inChatList = tab === "chat" && !chatTargetId;

  // Mở Profile dưới dạng FULL PAGE (không còn popup Sheet) — URL thay đổi, Back hoạt động
  const openProfileSheet = (id: string) => openUserProfile(id);

  // Hồ sơ người khác (overlay) là TRANG RIÊNG: không được reuse Home Header.
  const showGlobalHeader = !inChatDetail && !inChatList && !overlayUserId;

  return (
    <main className={`app-shell${showGlobalHeader ? " has-global-header" : ""}`}>
      {showGlobalHeader ? (
        <AppHeader
          title={title}
          me={me}
          isAdmin={isAdmin}
          showBack={false}
          onBack={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
          }}
          onProfile={() => navigate("/profile")}
          onActivityLog={() => navigate("/activity")}
          onBalanceHistory={() => navigate("/gem-history")}
          onTransferGem={() => navigate("/wallet")}
          onRanking={() => setRankingOpen(true)}
          onSettings={() => toast.info("Trang Cài đặt sắp ra mắt")}
          onLogout={() => { void logout(); }}
          unreadCount={notifUnread}
          onOpenNotifications={() => setNotifOpen(true)}
          onViewProfile={(id) => openUserProfile(id)}
          onOpenPost={(id) => goToPost(id)}
          onGoHome={() => { navigate("/"); }}
        />
      ) : null}
      <div className={`mobile-frame${inChatDetail ? " is-chat-detail" : ""}${inChatList ? " is-chat-list" : ""}`}>
        <div className="page-body">
          {tab === "fwb" && urlPostId ? (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <PostDetailPage postId={urlPostId} onViewProfile={openProfileSheet} />
            </Suspense>
          ) : tab === "fwb" ? (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <FeedPage
                category="general"
                onViewProfile={openProfileSheet}
                onOpenChat={(id: string) => setChatTargetId(id)}
                onOpenPost={goToPost}
                onOpenVideo={goToVideo}
                onOpenFwbHub={() => navigate("/")}
                onOpenNotifications={() => setNotifOpen(true)}
                unreadCount={unreadCount}
              />
            </Suspense>
          ) : null}
          {tab === "home" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <FwbTinderPage onOpenChat={(id: string) => setChatTargetId(id)} />
            </Suspense>
          )}
          {tab === "chat" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <ChatPage targetUserId={chatTargetId} onOpenProfile={openProfileSheet} />
            </Suspense>
          )}
          {tab === "profile" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <ProfilePage
                userId={profileId}
                onViewProfile={(id) => openUserProfile(id)}
                onOpenChat={(id: string) => setChatTargetId(id)}
                onOpenPost={goToPost}
                onOpenVideo={goToVideo}
              />
            </Suspense>
          )}
          {tab === "guide" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <LiveMocPage />
            </Suspense>
          )}
          {tab === "connect" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <SecretConnectPage />
            </Suspense>
          )}
        </div>
        <BottomNav
          active={tab}
          unreadCount={unreadCount}
          isAdmin={isAdmin}
          onChange={(nextTab: AppTab) => setTab(nextTab)}
          onCreate={() => setCreateOpen(true)}
        />
      </div>
      {overlayUserId ? (
        <ProfileOverlay
          key={overlayUserId}
          userId={overlayUserId}
          onClose={closeUserProfile}
          onViewProfile={(id) => openUserProfile(id)}
          onOpenChat={(id: string) => setChatTargetId(id)}
          onOpenPost={goToPost}
          onOpenVideo={goToVideo}
        />
      ) : null}

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenChat={(id) => { setNotifOpen(false); setChatTargetId(id); }}
        onOpenPost={(id, opts) => { setNotifOpen(false); goToPost(id, opts); }}
        onOpenVideo={(id) => { setNotifOpen(false); goToVideo(id); }}
        onConfirmCandy={() => { /* handled globally bởi RealtimeToastBridge */ }}
      />

      {createOpen ? (
      <Suspense fallback={null}>
      <CreatePostView
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPosted={() => {
          // Refresh feed on next view
          window.dispatchEvent(new CustomEvent("feed:refresh"));
        }}
      />
      </Suspense>
      ) : null}

      





      {transferOpen ? (
        <Suspense fallback={null}><TransferGemModal onClose={() => setTransferOpen(false)} /></Suspense>
      ) : null}
      {rankingOpen ? (
        <Suspense fallback={null}><RankingModal onClose={() => setRankingOpen(false)} /></Suspense>
      ) : null}

      {/* Pet World giờ là mini-game nổi (Messenger chat-head), luôn hiện sau khi login. */}
      <Suspense fallback={null}>
        <FloatingPetEgg />
        <FloatingBubbles />
      </Suspense>

      {/* V6 — Bong bóng trợ lý: hiển thị theo cấu hình Admin (ẩn ở Tin nhắn / Kết Nối 18+). */}
      {showAssistant ? (
        <Suspense fallback={null}><FloatingAssistant onNavigate={(path) => navigate(path)} /></Suspense>
      ) : null}

      {/* Popup VIP10 cho LIVE 18+ — phong cách iOS, glass + spring */}
      <AnimatePresence>
        {showLiveVipGate ? (
          <Portal>
            <motion.div
              key="livevip-bd"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLiveVipGate(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 10020,
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(8px) saturate(140%)",
                WebkitBackdropFilter: "blur(8px) saturate(140%)",
                display: "grid",
                placeItems: "center",
                padding: 16,
              }}
            >
            <motion.div
              key="livevip-pn"
              role="dialog"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              style={{
                position: "relative",
                zIndex: 10021,
                width: "min(86vw, 360px)",
                background: "hsl(var(--card) / 0.92)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid hsl(var(--border) / 0.6)",
                borderRadius: 28,
                padding: "28px 24px 20px",
                textAlign: "center",
                boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowLiveVipGate(false)}
                aria-label="Đóng"
                style={{
                  position: "absolute", top: 10, right: 10,
                  width: 36, height: 36, borderRadius: 999,
                  background: "hsl(var(--background) / 0.9)", border: "1px solid hsl(var(--border))",
                  display: "grid", placeItems: "center", cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                }}
              >
                <X size={18} />
              </button>
              <div style={{
                width: 72, height: 72, margin: "0 auto 14px",
                borderRadius: 24, display: "grid", placeItems: "center",
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                boxShadow: "0 12px 28px rgba(239,68,68,0.45)",
              }}>
                <Crown size={36} color="white" />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>LIVE 18+</h3>
              <p style={{ margin: "0 0 18px", fontSize: 14, color: "hsl(var(--muted-foreground))", lineHeight: 1.55 }}>
                Chức năng này <strong>chỉ dành cho thành viên VIP 10</strong>. Hãy nâng cấp để mở khoá phòng LIVE 18+.
              </p>
              <button
                type="button"
                onClick={() => setShowLiveVipGate(false)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 16,
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  color: "white", fontWeight: 800, fontSize: 15,
                  border: "none", cursor: "pointer",
                  boxShadow: "0 8px 20px rgba(239,68,68,0.35)",
                }}
              >
                Đã hiểu
              </button>
            </motion.div>
            </motion.div>
          </Portal>
        ) : null}
      </AnimatePresence>

      {showDisplayNameGate ? <DisplayNameGate /> : null}
    </main>
  );
}

export function CandyApp() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <LeaderboardBadgesProvider>
          <CandyAppInner />
          <ModerationPopupGate />
          {/* PHẦN 4: TopRankWatcher removed (bỏ popup "Bạn đang Top") */}
        </LeaderboardBadgesProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

