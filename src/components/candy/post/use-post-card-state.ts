import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFollowingSet, peekFollowing } from "@/lib/follow-set-cache";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { socialDb as db3 } from "@/services/database";
import type { PostRecord } from "@/lib/app-types";
import { isMissingRelationError, resolvePostImages } from "@/lib/db-compat";
import { formatRelativeTime } from "@/lib/time-format";
import { useAuth } from "@/components/candy/auth-provider";
import { useHasActiveStory } from "@/hooks/use-has-active-story";
import { logActivity, truncate as _truncate } from "@/lib/activity-log";
import { safeGemAmount } from "@/lib/gem-utils";
import { isPostDeletedError, handleDeletedPostInteraction } from "@/lib/post-deleted";
import { followUser, unfollowUser } from "@/lib/follow-actions";
import { bumpFollowerCount } from "@/lib/follow-count-store";
import { flyHeartToAvatar, shrinkHeart } from "@/lib/heart-fly";
import { baseLikeCount } from "@/lib/like-engine";
import { requestPostStats, patchPostStats, invalidatePostStats } from "@/lib/post-stats-batch";
import { resolveUserName } from "@/lib/user-name";
import { queuePostView } from "@/lib/post-view-queue";

import type { PostCardContextValue } from "./post-card-context";
import { guardAction } from "@/lib/rate-limit";

import { read3 } from "@/lib/content-db";
import { syncToS3, syncLikeRowToS3 } from "@/lib/content-sync";
export interface UsePostCardParams {
  meId?: string;
  post: PostRecord;
  canDelete?: boolean;
  onRefresh: () => void;
  onRemoved?: (postId: string) => void;
  onViewProfile: (userId: string) => void;
  compactMedia?: boolean;
}

/**
 * Extracted verbatim from the legacy 1235-line post-card.tsx.
 * Business logic, effects, and Supabase calls are UNCHANGED — only relocated.
 * Presentational subcomponents consume this via <PostCardProvider>.
 */
export function usePostCardState(params: UsePostCardParams): PostCardContextValue {
  const { meId, post, canDelete = false, onRefresh, onRemoved, onViewProfile, compactMedia } = params;
  const { refreshMe, setGemBalance } = useAuth();

  const _cachedLikes = Number((post as any)?.likes_count ?? 0) || 0;
  const _cachedComments = Number((post as any)?.comments_count ?? 0) || 0;
  const _cachedViews = Number((post as any)?.views_count ?? 0) || 0;

  const [likes, setLikes] = useState(_cachedLikes);
  const [comments, setComments] = useState(_cachedComments);
  const [liked, setLiked] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);
  const [commentBurst, setCommentBurst] = useState(0);
  const [openComments, setOpenComments] = useState(false);
  const [giftMenuOpen, setGiftMenuOpen] = useState(false);
  const [giftHistoryOpen, setGiftHistoryOpen] = useState(false);
  const [totalGifted, setTotalGifted] = useState(0);
  const isPostOwner = Boolean(meId && meId === post.user_id);

  const [menuOpen, setMenuOpen] = useState(false);

  // ---- Dropdown isolation: only one post menu open globally + close on scroll ----
  useEffect(() => {
    if (!menuOpen) return;
    const myId = post.id;
    const onOtherOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (detail?.id && detail.id !== myId) setMenuOpen(false);
    };
    const onScrollOrResize = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("post-menu:open", onOtherOpen as EventListener);
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("post-menu:open", onOtherOpen as EventListener);
      window.removeEventListener("scroll", onScrollOrResize, true as any);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, post.id]);

  const openPostMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    window.dispatchEvent(new CustomEvent("post-menu:open", { detail: { id: post.id } }));
    setMenuOpen(true);
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editText, setEditText] = useState(post.content || "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [isEdited, setIsEdited] = useState<boolean>(Boolean((post as any).is_edited));
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // ===== Auto Like V5 =====
  // Số tim ảo tăng dần theo TUỔI bài viết (0–3 khi vừa đăng → vài K sau 1 ngày).
  // <LikeButton /> tiếp tục nhích lên từng nấc nhỏ khi bài trong viewport.
  // Xem `src/lib/like-engine.ts`.
  const _dbInitialLikes = Number((post as any).bot_likes) || 0;
  const _isAdminPost =
    Boolean((post as any).is_admin_post) || Boolean((post as any).profiles?.is_admin);
  const _baseLikes = baseLikeCount(
    String(post.id),
    _dbInitialLikes,
    _isAdminPost,
    (post as any).created_at ?? null,
  );
  const viewOffset = Math.round(_baseLikes * 1.02);
  const autoLikeBump = 0;
  const autoLikeAmount = 1;

  const [realViews, setRealViews] = useState<number>(_cachedViews);
  const viewCount = viewOffset + realViews;







  const viewedRef = useRef(false);
  const images = resolvePostImages(post);
  const isAnonymous = !!(post as any).is_anonymous;
  const authorName = isAnonymous
    ? "Người dùng ẩn danh"
    : resolveUserName(post.profiles as any);
  const rawAuthorLocation = isAnonymous
    ? ""
    : post.profiles?.province || post.profiles?.location || "";
  const authorLocation = rawAuthorLocation.replace(/^Thành phố\s+/i, "TP. ");

  // TỐI ƯU: gộp likes / comments / views / gifts / liked của TẤT CẢ bài đang
  // mount vào 1 lượt truy vấn (xem src/lib/post-stats-batch.ts). Không còn
  // realtime cho like/view/gift ở feed (chỉ chat & thông báo dùng realtime).
  useEffect(() => {
    return requestPostStats(post.id, meId ?? null, (s) => {
      setLikes(s.likes);
      setComments(s.comments);
      setRealViews(s.views);
      setTotalGifted(s.gifts);
      setLiked(s.liked);
    });
  }, [post.id, meId]);

  // View thật: gom theo lô 45s rồi ghi 1 lần (không ghi DB liên tục).
  const trackView = useCallback(async () => {
    if (!meId) return;
    if (meId === post.user_id) return; // không buff view khi tự xem bài mình
    if (viewedRef.current) return;
    viewedRef.current = true;
    if (queuePostView(post.id, meId)) {
      window.dispatchEvent(new CustomEvent("post:view-counted", { detail: { postId: post.id } }));
    }
  }, [meId, post.id, post.user_id]);


  const hasStory = useHasActiveStory(post.user_id);

  useEffect(() => {
    let cancelled = false;
    if (!meId || !post.user_id || meId === post.user_id) {
      setFollowing(false);
      return;
    }
    // Follow-set được cache 1 lần cho cả feed (chống N+1: trước đây mỗi card
    // chạy riêng 1 query `follows`).
    const cached = peekFollowing(meId, post.user_id);
    if (cached !== undefined) {
      setFollowing(cached);
      return;
    }
    (async () => {
      const s = await getFollowingSet(meId);
      if (!cancelled) setFollowing(s.has(post.user_id));
    })();
    return () => { cancelled = true; };
  }, [meId, post.user_id]);

  // Sync follow state from global broadcasts (feed/profile/search all in sync).
  useEffect(() => {
    if (!post.user_id) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ targetId: string; following: boolean }>).detail;
      if (!d || d.targetId !== post.user_id) return;
      setFollowing(d.following);
    };
    window.addEventListener("nfwb:follow-change", handler as EventListener);
    return () => window.removeEventListener("nfwb:follow-change", handler as EventListener);
  }, [post.user_id]);

  const quickFollow = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!meId) return alert("Vui lòng đăng nhập.");
    if (followBusy || meId === post.user_id) return;
    setFollowBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);

    // Hiệu ứng ❤️ + cập nhật số Follow ngay (optimistic, không truy vấn thêm).
    const node = e.currentTarget as HTMLElement | null;
    const avatar =
      node?.closest(".pc-avatar-wrap")?.querySelector(".pc-avatar-img") ??
      node?.closest(".pc-avatar-wrap") ??
      null;
    const mouse = e as React.MouseEvent;
    const point =
      typeof mouse.clientX === "number" && mouse.clientX
        ? { x: mouse.clientX, y: mouse.clientY }
        : avatar
          ? {
              x: avatar.getBoundingClientRect().right,
              y: avatar.getBoundingClientRect().bottom,
            }
          : null;
    if (point) {
      if (wasFollowing) shrinkHeart(point);
      else flyHeartToAvatar(point, avatar);
    }
    bumpFollowerCount(post.user_id, wasFollowing ? -1 : 1);

    try {
      if (wasFollowing) {
        await unfollowUser(meId, post.user_id);
      } else {
        await followUser(meId, post.user_id);
        const peerName = resolveUserName(post.profiles as any, "ai đó");
        void logActivity({
          userId: meId,
          actionType: "follow",
          description: `Bạn đã bắt đầu yêu thích ${peerName}.`,
          targetId: post.user_id,
          metadata: { target_name: peerName },
        });
      }
    } catch (err: any) {
      setFollowing(wasFollowing);
      bumpFollowerCount(post.user_id, wasFollowing ? 1 : -1);
      alert(err?.message || "Không thể cập nhật yêu thích.");
    } finally {
      setFollowBusy(false);
    }
  };


  // Like/comment KHÔNG dùng realtime nữa (giảm tải Realtime + query).
  // Số liệu đến từ batch loader; hành động của chính user cập nhật cục bộ.
  const openCommentsRef = useRef(openComments);
  useEffect(() => { openCommentsRef.current = openComments; }, [openComments]);

  useEffect(() => {
    const onCommentAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId?: string } | undefined;
      if (!detail?.postId || detail.postId !== post.id) return;
      // Số liệu do cache dùng chung (post-stats-batch) cập nhật → Feed và
      // Profile nhận cùng một giá trị qua listener, không tự cộng riêng ở đây.
      void detail;
    };
    window.addEventListener("post:comment-added", onCommentAdded as EventListener);
    return () => window.removeEventListener("post:comment-added", onCommentAdded as EventListener);
  }, [post.id]);

  const postTime = useMemo(() => formatRelativeTime(post.created_at), [post.created_at]);

  // ===== Like =====
  const likeSyncingRef = useRef(false);
  const likeDesiredRef = useRef<boolean | null>(null);
  const likeInitialRef = useRef<boolean | null>(null);

  const syncLike = useCallback(async () => {
    if (!meId) return;
    if (likeSyncingRef.current) return;
    likeSyncingRef.current = true;
    try {
      while (likeDesiredRef.current !== null) {
        const desired = likeDesiredRef.current;
        likeDesiredRef.current = null;
        const initial = likeInitialRef.current;
        if (initial !== null && desired === initial) continue;
        if (desired) {
          const { error } = await supabase
            .from("likes")
            .upsert([{ post_id: post.id, user_id: meId }] as any, {
              onConflict: "post_id,user_id",
              ignoreDuplicates: true,
            });
          if (error) {
            if (isPostDeletedError(error)) {
              handleDeletedPostInteraction();
              onRemoved?.(post.id);
              return;
            }
            {
              const { handleRestrictionError } = await import("@/lib/restriction-guard");
              if (await handleRestrictionError(error)) return;
            }
            console.error("[likes] upsert:", error);
            continue;
          }

          likeInitialRef.current = true;
          syncLikeRowToS3(post.id, meId, "upsert");
          if (meId !== post.user_id) {
            const peerName = resolveUserName(post.profiles as any, "một thành viên");
            void logActivity({
              userId: meId,
              actionType: "post_like",
              description: `Bạn đã thích bài viết của ${peerName}.`,
              targetId: post.id,
              metadata: { post_id: post.id, target_name: peerName },
            });
          } else {
            try {
              await db3()
                .from("notifications").delete()
                .eq("user_id", meId).in("type", ["like_post"])
                .contains("data", { post_id: post.id } as any);
            } catch { /* best-effort */ }
          }
        } else {
          const { error } = await supabase
            .from("likes").delete()
            .eq("post_id", post.id).eq("user_id", meId);
          if (error) { console.error("[likes] delete:", error); continue; }
          likeInitialRef.current = false;
          syncLikeRowToS3(post.id, meId, "delete");
        }
      }
    } finally {
      likeSyncingRef.current = false;
    }
  }, [meId, post.id, post.user_id, post.profiles?.full_name, post.profiles?.username, onRemoved]);
  // likeCooldownUntil kept for backward compat with LikeButton props.
  // The global rate limiter (guardAction("like")) is the source of truth.
  const [likeCooldownUntil] = useState(0);

  const toggleLike = useCallback(async () => {
    if (!meId) { toast.error("Bạn cần đăng nhập để sử dụng tính năng này."); return; }

    // --- Optimistic first: UI phản hồi ngay, không chờ gate/DB ---
    const prevLiked = liked;
    const next = !liked;
    setLiked(next);
    setLikes((v) => {
      const n = Math.max(0, v + (next ? 1 : -1));
      patchPostStats(post.id, { likes: n, liked: next });
      return n;
    });
    if (next) setLikeBurst((n) => n + 1);

    const revert = () => {
      setLiked(prevLiked);
      setLikes((v) => {
        const n = Math.max(0, v + (next ? -1 : 1));
        patchPostStats(post.id, { likes: n, liked: prevLiked });
        return n;
      });
    };

    // Restriction gate — like actions may be blocked by admin.
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("like"))) { revert(); return; }
    }

    // Global rate limiter (like: 5 / 5s by default). Toast handled inside.
    if (!(await guardAction("like"))) { revert(); return; }

    likeDesiredRef.current = next;
    if (likeInitialRef.current === null) likeInitialRef.current = !next;
    void syncLike();
  }, [meId, liked, syncLike]);


  const removePost = async () => {
    setMenuOpen(false);
    if (!window.confirm("Bạn muốn xóa bài viết này?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) return alert(error.message);
    syncToS3("posts", { id: post.id }, "delete");
    invalidatePostStats(post.id);
    window.dispatchEvent(new CustomEvent("post:removed", { detail: { postId: post.id } }));
    onRemoved?.(post.id);
    onRefresh();
  };

  const pinnedActive = useMemo(() => {
    if (!(post as any).is_pinned) return false;
    const until = (post as any).pinned_until;
    return !until || new Date(until).getTime() > Date.now();
  }, [post]);
  const featuredActive = useMemo(() => {
    if (!(post as any).is_featured) return false;
    const until = (post as any).featured_until;
    return !until || new Date(until).getTime() > Date.now();
  }, [post]);
  const commentsDisabled = Boolean((post as any).comments_disabled);
  const isLocked = Boolean((post as any).is_locked);
  const lockedReason: string | null = (post as any).locked_reason || null;

  const openReport = () => {
    setMenuOpen(false);
    if (!meId) return alert("Vui lòng đăng nhập.");
    if (post.user_id === meId) return;
    setReportOpen(true);
  };

  const startEdit = () => {
    setMenuOpen(false);
    setEditText(post.content || "");
    setEditingCaption(true);
  };

  const saveEdit = async () => {
    const newText = editText.trim();
    if (!newText) { toast.error("Nội dung không được để trống."); return; }
    setSavingEdit(true);
    const { error } = await supabase
      .from("posts")
      .update({ content: newText, is_edited: true } as any)
      .eq("id", post.id);
    setSavingEdit(false);
    if (error) { toast.error(error.message || "Không thể cập nhật bài viết."); return; }
    syncToS3("posts", { id: post.id });
    (post as any).content = newText;
    (post as any).is_edited = true;
    setIsEdited(true);
    setEditingCaption(false);
    toast.success("Đã cập nhật bài viết.");
    onRefresh();
  };

  const [showGiftBurst, setShowGiftBurst] = useState(false);
  const _sendGiftUnused = async (amount: number) => {
    // Preserved for future compat; not called from new UI.
    if (!meId) return alert("Vui lòng đăng nhập.");
    const safeAmount = safeGemAmount(amount);
    if (!safeAmount || safeAmount <= 0) return alert("Số Gem không hợp lệ.");
    if (post.user_id === meId) return alert("Không thể tự chuyển Gem cho mình.");
    const { data, error } = await supabase.rpc("secure_transfer_gem" as any, {
      p_receiver_id: post.user_id,
      p_amount: Number(safeAmount),
      p_note: `Tặng quà bài viết ${post.id}`,
    });
    if (error) { toast.error(error.message); return; }
    const res: any = data;
    if (!res || res.ok === false) { toast.error(res?.message || "Giao dịch thất bại!"); return; }
    if (typeof res.total_gem === "number") setTotalGifted(res.total_gem);
    else setTotalGifted((v) => v + safeAmount);
    const nextBalance = Number(res?.new_balance ?? res?.sender_new_balance);
    if (Number.isFinite(nextBalance)) setGemBalance(nextBalance);
    await refreshMe();
  };
  void _sendGiftUnused;
  void _truncate;

  const copyUrl = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã sao chép URL bài viết", { description: url });
    } catch {
      toast(url);
    }
  };

  const copyUid = async () => {
    const uid = post.id;
    try {
      await navigator.clipboard.writeText(uid);
      toast.success("Đã sao chép Post UID", { description: uid });
    } catch {
      toast(uid);
    }
  };

  const categoryMeta = (() => {
    const c = (post as any).category as string | undefined;
    if (c === "fwb") return { label: "FWB", emoji: "✨", className: "post-category-badge-fwb" };
    if (c === "ons") return { label: "ONS", emoji: "🔥", className: "post-category-badge-ons" };
    if (c === "dating" || c === "love" || c === "serious")
      return { label: "Dating", emoji: "💖", className: "post-category-badge-dating" };
    if (c === "private")
      return { label: "Private", emoji: "🔒", className: "post-category-badge-private" };
    return null;
  })();

  // Số tim khởi điểm hiển thị (client-only), cộng vào số like thật.
  const botLikes = _baseLikes;

  return {
    post, meId, isAnonymous, isPostOwner, canDelete: !!canDelete,
    authorName, authorLocation, postTime, hasStory,
    following, followBusy,
    images, compactMedia,
    isEdited, pinnedActive, featuredActive, isLocked, lockedReason, commentsDisabled, categoryMeta,
    likes, botLikes, comments, liked, likeBurst, autoLikeBump, autoLikeAmount, commentBurst, viewCount,
    likeCooldownUntil, totalGifted, showGiftBurst,
    editingCaption, editText, savingEdit,
    menuOpen, reportOpen, giftMenuOpen, giftHistoryOpen, openComments,
    onViewProfile,
    quickFollow, toggleLike,
    setEditText, setEditingCaption, saveEdit, startEdit, removePost,
    openReport, setReportOpen, copyUrl, copyUid, openPostMenu, setMenuOpen,
    setCommentBurst, setOpenComments, setGiftMenuOpen, setGiftHistoryOpen,
    setTotalGifted, setShowGiftBurst,
    onRefresh, onRemoved,
    trackView,

  };
}
