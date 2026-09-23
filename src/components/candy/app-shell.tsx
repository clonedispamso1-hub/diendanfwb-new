import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { closeAllOverlays } from "@/lib/modal-manager";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { AppHeader } from "@/components/candy/app-header";
import { AuthScreen } from "@/components/candy/auth-screen";
import { PendingApprovalScreen } from "@/components/candy/pending-approval-screen";
import { SuspendedOverlay } from "@/components/candy/suspended-overlay";
import { BottomNav, type AppTab } from "@/components/candy/bottom-nav";

import { NotificationsPanel, useUnreadNotifications } from "@/components/candy/notifications-panel";
import { ProfileOverlay } from "@/components/candy/profile-overlay";

const ChatPage = lazyWithRetry(() => import("@/components/candy/chat-page").then(m => ({ default: m.ChatPage })));
const preloadChatPage = () => import("@/components/candy/chat-page");
const FeedPage = lazyWithRetry(() => import("@/components/candy/feed-page").then(m => ({ default: m.FeedPage })));
const PostDetailPage = lazyWithRetry(() => import("@/components/candy/post-detail-page").then(m => ({ default: m.PostDetailPage })));
const ProfilePage = lazyWithRetry(() => import("@/components/candy/profile-page").then(m => ({ default: m.ProfilePage })));
const LiveMocPage = lazyWithRetry(() => import("@/components/candy/live/live-moc-page").then(m => ({ default: m.LiveMocPage })));
const FeedbackPage = lazyWithRetry(() => import("@/components/candy/feedback/feedback-page").then(m => ({ default: m.FeedbackPage })));
// (Admin panel is now reached via Profile menu → /admin route, not the home tab)

import { Portal } from "@/components/candy/portal";
import { X, Crown } from "lucide-react";

import { NotificationProvider, useNotification } from "@/components/candy/notification-provider";
import { getMessagePreview } from "@/lib/message-preview";
import { fetchProfileById } from "@/lib/profile-cache";
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
const FloatingDock = lazyWithRetry(() => import("@/components/candy/floating-dock").then(m => ({ default: m.FloatingDock })));
import { Button } from "@/components/ui/button";
// PHẦN 4: Bỏ popup "Bạn đang Top" — TopRankWatcher import removed.
import { LeaderboardBadgesProvider } from "@/components/candy/leaderboard-badges-provider";
import { chatDb } from "@/lib/chat-db";
import { resolveUserName } from "@/lib/user-name";
import { playNotifySound } from "@/lib/notify-sound";

/** Map URL pathname → AppTab.
 * Trang chủ (feed) là MẶC ĐỊNH ở "/". Tab "Tìm FWB" (swipe + onboarding)
 * nằm tại "/find-fwb" — chỉ vào tab này mới gating onboarding. */
function pathToTab(pathname: string): AppTab {
  // "/u/:id" = hồ sơ người khác dạng trang con → giữ nguyên tab phía dưới (Trang chủ).
  if (pathname.startsWith("/u/")) return "fwb";
  if (pathname.startsWith("/feedback")) return "feedback";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/guide") || pathname.startsWith("/ket-noi") || pathname.startsWith("/huong-dan")) return "guide";
  if (pathname.startsWith("/connect") || pathname.startsWith("/pet")) return "fwb";
  if (pathname.startsWith("/find-fwb")) return "home"; // Tìm FWB (swipe)
  // "/", "/fwb", "/love" (legacy) → Trang chủ feed
  return "fwb";
}
function tabToPath(tab: AppTab): string {
  if (tab === "home") return "/find-fwb"; // Tìm FWB swipe
  if (tab === "guide") return "/guide";
  if (tab === "feedback") return "/feedback";
  if (tab === "fwb") return "/"; // Trang chủ feed
  return `/${tab}`;
}

function CandyAppInner() {
  const { me, ready, isAdmin, logout, approvalStatus, deviceAccountIndex, refreshApproval } = useAuth();
  const { notify } = useNotification();
  useOnlineHeartbeat(me?.id);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const tab = pathToTab(location.pathname);
  // Điều hướng đồng bộ (KHÔNG bọc startTransition, KHÔNG preload chunk):
  // cả hai đều từng làm Feedback không hiển thị / mất Header + Bottom Nav.
  const go = useCallback(
    (to: string | number) => {
      if (typeof to === "number") navigate(to);
      else navigate(to);
    },
    [navigate],
  );
  const setTab = (next: AppTab) => go(tabToPath(next));

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
    // Modal manager: luôn đóng mọi popup đang mở TRƯỚC khi mở Hồ sơ,
    // để Hồ sơ không bao giờ nằm dưới popup (comment, quà, feedback…).
    closeAllOverlays();
    setNotifOpen(false);
    setTransferOpen(false);
    setRankingOpen(false);
    setCreateOpen(false);
    if (id === me?.id) { go("/profile"); return; }
    go(`/u/${id}`);
  };
  const closeUserProfile = () => {
    if (window.history.length > 1) go(-1);
    else go("/");
  };
  const setChatTargetId = (id: string | null) => {
    if (id) go(`/chat/${id}`);
    else go("/chat");
  };
  const openChatFromProfile = async (id: string) => {
    if (!id) return;
    // Profile là một overlay đang giữ body ở trạng thái khoá cuộn. Đợi module
    // chat sẵn sàng trước khi đổi route để overlay được tháo và màn chat đầy đủ
    // (header/messages/composer) thay thế nó trong cùng một nhịp render.
    try {
      await preloadChatPage();
    } catch (error) {
      // lazyWithRetry vẫn xử lý lỗi chunk tại màn đích; không chặn điều hướng.
      console.warn("[chat] preload failed; continuing navigation", error);
    } finally {
      setChatTargetId(id);
    }
  };

  const [unreadCount, setUnreadCount] = useState(0);
  // Chống trùng realtime: nhớ id các tin nhắn đã xử lý (badge + âm thanh).
  const seenMsgIds = useRef<Set<string>>(new Set());

  const { count: notifUnread, refresh: refreshNotifUnread } = useUnreadNotifications();
  // Badge chuông = đúng số thông báo CHƯA XEM từ store dùng chung.
  // Không latch thủ công: store tự giảm khi DB xác nhận đã đọc, tự tăng khi có mới.
  const bellBadgeCount = notifUnread;


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

  // "Hướng dẫn tham gia" (popup khoá tính năng) ở BẤT KỲ trang/tab nào
  // → về trang chủ feed ("/" = tab fwb) để FeedPage mount và tự mở tab
  // "Vip Zalo Tham Gia". Cờ sessionStorage do popup đặt sẽ được FeedPage đọc
  // ngay khi mount, nên không cần reload trang.
  useEffect(() => {
    const handler = () => {
      if (location.pathname !== "/") navigate("/");
    };
    window.addEventListener("goto-vip-zalo-tab", handler as EventListener);
    return () => window.removeEventListener("goto-vip-zalo-tab", handler as EventListener);
  }, [navigate, location.pathname]);

  // Bấm badge 🔴 LIVE ở bất kỳ đâu → chuyển sang tab Live Móc 🦋 (phòng sẽ tự cuộn tới).
  useEffect(() => {
    const handler = () => {
      setTab("guide");
      if (location.pathname !== "/") navigate("/");
    };
    window.addEventListener("app:open-live", handler as EventListener);
    return () => window.removeEventListener("app:open-live", handler as EventListener);
  }, [navigate, location.pathname]);

  // Một nguồn trạng thái duy nhất cho điều hướng Home trên mọi viewport:
  // initial = header + feed tabs + dock; down = chỉ feed tabs; up = header + dock.
  // Chỉ Trang chủ ("/") mới khởi tạo listener này. Ghi trạng thái trực tiếp
  // lên body để không làm React render lại toàn bộ feed.
  useEffect(() => {
    if (location.pathname !== "/") {
      document.body.removeAttribute("data-scroll-nav-scope");
      document.body.removeAttribute("data-scroll-nav-state");
      return;
    }

    const key = `scroll:${location.pathname}`;
    let el: HTMLElement | null = null;
    let raf = 0;
    let ticking = false;
    let disposed = false;
    let lastTop = 0;
    let accumulatedDelta = 0;
    let lastDirection: -1 | 0 | 1 = 0;
    let navState: "initial" | "down" | "up" = "initial";
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    const DIRECTION_THRESHOLD = 12;
    const TOP_THRESHOLD = 4;

    // Reset mỗi khi đổi route để màn mới luôn bắt đầu ở trạng thái đầy đủ.
    document.body.setAttribute("data-scroll-nav-scope", "home");
    document.body.setAttribute("data-scroll-nav-state", "initial");

    const setNavState = (next: "initial" | "down" | "up") => {
      if (navState === next) return;
      navState = next;
      document.body.setAttribute("data-scroll-nav-state", next);
    };

    /** `.page-body` chỉ là vùng cuộn khi nó thực sự overflow + có overflow-y scrollable. */
    const elScrolls = (node: HTMLElement | null): node is HTMLElement => {
      if (!node) return false;
      if (node.scrollHeight <= node.clientHeight + 4) return false;
      const oy = getComputedStyle(node).overflowY;
      return oy === "auto" || oy === "scroll" || oy === "overlay";
    };

    const getTop = () => {
      if (isDesktop) {
        return document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop ?? window.scrollY;
      }
      return elScrolls(el)
        ? el.scrollTop
        : window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    };

    const setTop = (top: number) => {
      if (!isDesktop && elScrolls(el)) el.scrollTop = top;
      else window.scrollTo(0, top);
    };

    const isLocked = () =>
      document.body.hasAttribute("data-scroll-locked") ||
      document.body.hasAttribute("data-modal-open") ||
      document.body.classList.contains("modal-open") ||
      document.body.style.overflow === "hidden";

    // iPhone Safari có thể phát scroll giả khi visual viewport đổi do bàn phím.
    const isKeyboardOpen = () => {
      const viewport = window.visualViewport;
      if (!viewport) return false;
      const focused = document.activeElement;
      const acceptsInput =
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        (focused instanceof HTMLElement && focused.isContentEditable);
      return acceptsInput && viewport.height + viewport.offsetTop < window.innerHeight - 80;
    };

    const update = () => {
      ticking = false;
      const cur = getTop();
      sessionStorage.setItem(key, String(cur));

      if (isLocked() || isKeyboardOpen()) {
        lastTop = cur;
        accumulatedDelta = 0;
        lastDirection = 0;
        return;
      }

      const delta = cur - lastTop;
      lastTop = cur;

      if (cur <= TOP_THRESHOLD) {
        accumulatedDelta = 0;
        lastDirection = 0;
        setNavState("initial");
        return;
      }

      // Bỏ nhiễu sub-pixel và chỉ chuyển sau khi đã đi đủ 12px cùng một hướng.
      if (Math.abs(delta) < 0.5) return;
      const direction: -1 | 1 = delta > 0 ? 1 : -1;
      accumulatedDelta = direction === lastDirection ? accumulatedDelta + delta : delta;
      lastDirection = direction;

      if (accumulatedDelta >= DIRECTION_THRESHOLD) {
        setNavState("down");
        accumulatedDelta = 0;
      } else if (accumulatedDelta <= -DIRECTION_THRESHOLD) {
        setNavState("up");
        accumulatedDelta = 0;
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(update);
    };

    // Desktop cuộn bằng document; mobile giữ nguyên nguồn `.page-body` hiện tại.
    window.addEventListener("scroll", onScroll, { passive: true });

    const attach = (node: HTMLElement) => {
      el = node;
      node.addEventListener("scroll", onScroll, { passive: true });
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const top = parseInt(saved, 10);
        if (!Number.isNaN(top) && top > 0) {
          requestAnimationFrame(() => {
            if (disposed) return;
            setTop(top);
            lastTop = getTop(); // Không coi vị trí khôi phục là "cuộn xuống".
            update();
          });
        }
      }
      lastTop = getTop();
      update();
    };

    let observer: MutationObserver | null = null;
    if (isDesktop) {
      lastTop = getTop();
      update();
    } else {
      // .page-body có thể mount trễ (Suspense) → chờ tới khi có.
      const found = document.querySelector<HTMLElement>(".page-body");
      if (found) {
        attach(found);
      } else {
        observer = new MutationObserver(() => {
          const node = document.querySelector<HTMLElement>(".page-body");
          if (node && !disposed) {
            observer?.disconnect();
            observer = null;
            attach(node);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      el?.removeEventListener("scroll", onScroll);
      document.body.removeAttribute("data-scroll-nav-scope");
      document.body.removeAttribute("data-scroll-nav-state");
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
      chatDb()
        .from("messages")
        .select("sender_id, created_at, deleted_by_users")
        .eq("receiver_id", me.id)
        .eq("is_read", false),
      chatDb()
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
      // Tin đã "xoá phía tôi" → không tính vào badge chưa đọc.
      if (Array.isArray(m.deleted_by_users) && m.deleted_by_users.includes(me.id)) continue;
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
  // `notifications` đã chuyển sang Supabase #3 → KHÔNG gộp chung channel với
  // `messages` (Supabase #1), nếu không registry sẽ mở channel log trên #1 và
  // gây lỗi 42P01 (relation "notifications" does not exist).
  const onShellRealtime = useCallback((payload: any, topicIndex: number) => {
      if (!me?.id) return;
      if (topicIndex === 0) {
        void (async () => {
          const msg = pickNew(payload) as any;
          if (!msg || msg.sender_id === me.id) return;
          const senderId = msg.sender_id as string;
          // Chống realtime event trùng: mỗi message id chỉ xử lý đúng một lần.
          const msgId = String(msg.id ?? "");
          if (msgId) {
            if (seenMsgIds.current.has(msgId)) return;
            seenMsgIds.current.add(msgId);
            if (seenMsgIds.current.size > 500) {
              seenMsgIds.current = new Set(Array.from(seenMsgIds.current).slice(-200));
            }
          }
          // Nếu user đã "Xoá cuộc trò chuyện" với sender và message này có
          // created_at <= cleared_at → bỏ qua hoàn toàn (không badge, không âm thanh).
          try {
            const { data: clearRow } = await chatDb()
              .from("conversation_clears" as any)
              .select("cleared_at")
              .eq("user_id", me.id)
              .eq("partner_id", senderId)
              .maybeSingle();
            const clearedAt = clearRow ? new Date((clearRow as any).cleared_at).getTime() : 0;
            const msgTs = new Date(msg.created_at ?? Date.now()).getTime();
            if (clearedAt > 0 && msgTs <= clearedAt) return;
          } catch { /* ignore — thiếu bảng cũng không chặn badge */ }
          setUnreadCount((v) => v + 1);
          playNotifySound();
          // Popup Messenger-style: avatar + tên + preview, bấm vào mở đúng
          // cuộc trò chuyện đang có (chỉ điều hướng router, không reload).
          const alreadyOpen =
            window.location.pathname === `/chat/${senderId}` ||
            window.location.pathname.startsWith(`/chat/${senderId}/`);
          if (alreadyOpen) return;
          let name = "Tin nhắn mới";
          let avatarUrl: string | null = null;
          try {
            const p = await fetchProfileById(senderId);
            name = (p?.display_name || p?.full_name || p?.username || name) as string;
            avatarUrl = (p?.avatar as string) || null;
          } catch { /* thiếu hồ sơ vẫn hiện popup */ }
          notify({
            type: "message",
            title: name,
            message: getMessagePreview(msg as any),
            avatarUrl,
            onClick: () => navigate(`/chat/${senderId}`),
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, navigate, notify]);

  // Channel #1: tin nhắn (Supabase #1)
  useRealtime(
    me?.id ? `app-shell-msg-${me.id}` : null,
    [
      { table: "messages", event: "INSERT", filter: `receiver_id=eq.${me?.id}` },
      { table: "messages", event: "UPDATE", filter: `receiver_id=eq.${me?.id}` },
      { table: "messages", event: "DELETE", filter: `receiver_id=eq.${me?.id}` },
    ],
    onShellRealtime,
  );

  // Channel #2: thông báo (Supabase #3 — registry tự chọn db3() cho bảng log)
  useRealtime(
    me?.id ? `app-shell-notif-${me.id}` : null,
    [{ table: "notifications", event: "INSERT", filter: `user_id=eq.${me?.id}` }],
    (payload) => onShellRealtime(payload, 3),
  );

  const title = useMemo(() => {
    if (tab === "chat") return chatTargetId ? "Cuộc trò chuyện" : "Tin nhắn";
    if (tab === "profile") return profileId && profileId !== me?.id ? "Hồ sơ người dùng" : "Hồ sơ của tôi";
    if (tab === "fwb") return "Trang chủ";
    if (tab === "home") return "Tìm FWB";
    if (tab === "guide") return "Kết nối";
    if (tab === "feedback") return "⭐ Feedback";
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
      location.pathname.startsWith("/live18") ||
      location.pathname.startsWith("/important") ||
      location.pathname.startsWith("/quan-trong") ||
      location.pathname.startsWith("/huong-dan")
    ) {
      navigate("/guide", { replace: true });
    }
    if (
      location.pathname.startsWith("/connect") ||
      location.pathname.startsWith("/pet")
    ) {
      navigate("/", { replace: true });
    }
  }, [me, location.pathname, navigate]);


  const goToPost = (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => {
    setFocusComments(!!opts?.focusComments || !!opts?.commentId);
    setFocusCommentId(opts?.commentId || null);
    setHighlightPostId(postId);
    const query = opts?.commentId ? `?comment=${encodeURIComponent(opts.commentId)}` : "";
    go(`/post/${postId}${query}`);
  };
  const goToVideo = (videoId: string) => {
    setHighlightVideoId(videoId);
    go("/");
  };

  // Các hook route phải luôn chạy trước mọi early return của auth/onboarding.
  // Khi rời danh sách Messages, để React giữ nguyên màn hiện tại trong lúc
  // trang lazy đích đang suspend. Nhờ vậy class/layout Messages chỉ được bỏ
  // ở cùng commit mà nội dung đích đã sẵn sàng, không lộ page-fallback.
  const inChatList = tab === "chat" && !chatTargetId;
  const routeView = useMemo(
    () => ({ tab, chatTargetId, urlPostId }),
    [tab, chatTargetId, urlPostId],
  );
  const deferredRouteView = useDeferredValue(routeView);
  const isLeavingChatList =
    tab !== "chat" &&
    deferredRouteView.tab === "chat" &&
    !deferredRouteView.chatTargetId;
  const renderedRoute = isLeavingChatList ? deferredRouteView : routeView;
  const renderedTab = renderedRoute.tab;
  const renderedChatTargetId = renderedRoute.chatTargetId;
  const renderedPostId = renderedRoute.urlPostId;
  const renderedInChatDetail = renderedTab === "chat" && !!renderedChatTargetId;
  const renderedInChatList = renderedTab === "chat" && !renderedChatTargetId;
  const [settledWasChatList, setSettledWasChatList] = useState(inChatList);
  const isMessagesRouteTransition = isLeavingChatList || (settledWasChatList && tab !== "chat");

  useLayoutEffect(() => {
    // Chỉ đánh dấu route mới đã ổn định sau khi deferred content thực sự bắt kịp.
    // Commit kế tiếp chỉ gỡ class transition; padding không đổi nên không thể animate.
    if (renderedRoute === routeView) setSettledWasChatList(inChatList);
  }, [inChatList, renderedRoute, routeView]);

  if (!ready) return <main className="loading-screen">Đang tải ứng dụng...</main>;
  if (!me) {
    return (
      <>
        <AuthScreen />
      </>
    );
  }

  // Tài khoản thứ 2+ trên cùng thiết bị: chờ Admin phê duyệt → không vào website.
  if (!isAdmin && (approvalStatus === "pending" || approvalStatus === "rejected")) {
    return (
      <PendingApprovalScreen
        status={approvalStatus}
        seq={deviceAccountIndex}
        onRecheck={async () => { await refreshApproval(); }}
        onLogout={() => { void logout(); }}
      />
    );
  }

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

  // Mở Profile dưới dạng FULL PAGE (không còn popup Sheet) — URL thay đổi, Back hoạt động
  const openProfileSheet = (id: string) => openUserProfile(id);

  // Hồ sơ người khác (overlay) là TRANG RIÊNG: không được reuse Home Header.
  const showGlobalHeader = !renderedInChatDetail && !renderedInChatList && !overlayUserId;

  return (
    <main className={`app-shell${showGlobalHeader ? " has-global-header" : ""}${isMessagesRouteTransition ? " is-route-transitioning-from-messages" : ""}`}>
      {showGlobalHeader ? (
        <AppHeader
          title={title}
          me={me}
          isAdmin={isAdmin}
          showBack={false}
          onBack={() => {
            if (window.history.length > 1) go(-1);
            else go("/");
          }}
          onProfile={() => go("/profile")}
          onActivityLog={() => navigate("/activity")}
          onBalanceHistory={() => navigate("/gem-history")}
          onTransferGem={() => navigate("/wallet")}
          onRanking={() => setRankingOpen(true)}
          onSettings={() => toast.info("Trang Cài đặt sắp ra mắt")}
          onLogout={() => { void logout(); }}
          unreadCount={bellBadgeCount}
          onOpenNotifications={() => { setNotifOpen(true); void refreshNotifUnread(); }}
          notificationsOpen={notifOpen}
          hideSearchAndNotif={false}
          onViewProfile={(id) => openUserProfile(id)}
          onOpenPost={(id) => goToPost(id)}
          onGoHome={() => { go("/"); }}
        />
      ) : null}
      <div className={`mobile-frame${renderedInChatDetail ? " is-chat-detail" : ""}${renderedInChatList ? " is-chat-list" : ""}`}>
        <div className="page-body">
          {renderedTab === "fwb" && renderedPostId ? (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <PostDetailPage postId={renderedPostId} onViewProfile={openProfileSheet} />
            </Suspense>
          ) : renderedTab === "fwb" ? (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <FeedPage
                category="general"
                onViewProfile={openProfileSheet}
                onOpenChat={(id: string) => setChatTargetId(id)}
                onOpenPost={goToPost}
                onOpenVideo={goToVideo}
                onOpenFwbHub={() => go("/")}
                onOpenNotifications={() => setNotifOpen(true)}
                unreadCount={unreadCount}
              />
            </Suspense>
          ) : null}
          {renderedTab === "chat" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <ChatPage
                targetUserId={renderedChatTargetId}
                onOpenProfile={openProfileSheet}
                onChatTargetChange={(id) => setChatTargetId(id)}
              />
            </Suspense>
          )}
          {renderedTab === "profile" && (
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
          {renderedTab === "guide" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <LiveMocPage />
            </Suspense>
          )}
          {renderedTab === "feedback" && (
            <Suspense fallback={<div className="page-fallback" aria-hidden />}>
              <FeedbackPage />
            </Suspense>
          )}
        </div>
        <BottomNav
          active={renderedTab}
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
          onOpenChat={openChatFromProfile}
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
        <FloatingDock />
      </Suspense>

      

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

