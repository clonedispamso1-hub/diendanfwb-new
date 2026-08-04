import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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

import type { PostCardContextValue } from "./post-card-context";
import { guardAction } from "@/lib/rate-limit";
import { computePostBuff } from "@/lib/buff-engagement";

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

  // ===== Buff Like & View tự nhiên (client-only, deterministic) =====
  // Không đụng DB. 15 phút đầu KHÔNG buff. Sau đó sinh Target theo phân bố
  // 70/20/8/2 dựa trên hash post.id + tuổi bài. Xem `src/lib/buff-engagement.ts`.
  const nowTick = useMemo(() => Date.now(), [post.id, post.created_at]);
  const _buff = useMemo(
    () => computePostBuff(post.id, post.created_at, nowTick),
    [post.id, post.created_at, nowTick],
  );
  const viewOffset = _buff.buffViews;

  const [realViews, setRealViews] = useState<number>(_cachedViews);
  const viewCount = viewOffset + realViews;





  const viewedRef = useRef(false);
  const images = resolvePostImages(post);
  const isAnonymous = !!(post as any).is_anonymous;
  const authorName = isAnonymous
    ? "Người dùng ẩn danh"
    : post.profiles?.full_name || "Người dùng";
  const rawAuthorLocation = isAnonymous
    ? ""
    : post.profiles?.province || post.profiles?.location || "";
  const authorLocation = rawAuthorLocation.replace(/^Thành phố\s+/i, "TP. ");

  useEffect(() => {
    let cancelled = false;
    const loadGifts = async () => {
      const { data, error } = await supabase
        .from("post_gifts" as any)
        .select("amount")
        .eq("post_id", post.id);
      if (cancelled) return;
      if (error) { setTotalGifted(0); return; }
      const sum = (data || []).reduce((acc: number, row: any) => acc + (row.amount || 0), 0);
      setTotalGifted(sum);
    };
    void loadGifts();
    const channelName = `post-gifts-${post.id}-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "post_gifts", filter: `post_id=eq.${post.id}` },
      (payload: any) => setTotalGifted((v) => v + ((payload.new?.amount as number) || 0)),
    ).subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [post.id]);

  useEffect(() => {
    const loadStats = async () => {
      const [likeResult, commentResult, myLikeResult] = await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        meId
          ? supabase.from("likes").select("id").eq("post_id", post.id).eq("user_id", meId).maybeSingle()
          : Promise.resolve({ data: null as { id: string } | null }),
      ]);
      setLikes(likeResult.count || 0);
      setComments(commentResult.count || 0);
      setLiked(Boolean(myLikeResult.data));
    };
    void loadStats();
  }, [meId, post.id]);

  // PHẦN 5: Chỉ load số view khi mount. KHÔNG upsert view khi mount nữa —
  // việc tracking view thật (IntersectionObserver, 1 user/post chỉ tính 1 lần,
  // và không tính khi tự xem bài mình) do `trackView` xử lý, và được PostCard
  // gọi sau khi article đã hiện trong viewport một khoảng thời gian.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("post_views" as any)
        .select("*", { count: "exact", head: true })
        .eq("post_id", post.id);
      if (cancelled) return;
      setRealViews(count || 0);
    })();
    return () => { cancelled = true; };
  }, [post.id]);

  const trackView = useCallback(async () => {
    if (!meId) return;
    if (meId === post.user_id) return; // không buff view khi tự xem bài mình
    if (viewedRef.current) return;
    viewedRef.current = true;
    const { error } = await supabase
      .from("post_views" as any)
      .upsert({ post_id: post.id, user_id: meId } as any, {
        onConflict: "post_id,user_id",
        ignoreDuplicates: true,
      });
    if (!error) setRealViews((v) => v + 1);
  }, [meId, post.id, post.user_id]);


  const hasStory = useHasActiveStory(post.user_id);

  useEffect(() => {
    let cancelled = false;
    if (!meId || !post.user_id || meId === post.user_id) {
      setFollowing(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", meId)
        .eq("following_id", post.user_id)
        .maybeSingle();
      if (!cancelled) setFollowing(Boolean(data));
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
        const peerName = post.profiles?.full_name || post.profiles?.username || "ai đó";
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


  // Realtime likes/comments
  const openCommentsRef = useRef(openComments);
  useEffect(() => { openCommentsRef.current = openComments; }, [openComments]);

  useEffect(() => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase.channel(`post-interactions-${post.id}-${suffix}`);
    const refreshLikes = () => {
      supabase.from("likes").select("*", { count: "exact", head: true })
        .eq("post_id", post.id).then(({ count }) => setLikes(count || 0));
    };
    const refreshComments = () => {
      supabase.from("comments").select("*", { count: "exact", head: true })
        .eq("post_id", post.id).then(({ count }) => setComments(count || 0));
    };
    channel
      .on("postgres_changes",
        { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${post.id}` },
        refreshLikes)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
        refreshComments)
      .subscribe();
    const onCommentAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId?: string } | undefined;
      if (!detail?.postId || detail.postId !== post.id) return;
      setComments((v) => v + 1);
    };
    window.addEventListener("post:comment-added", onCommentAdded as EventListener);
    return () => {
      window.removeEventListener("post:comment-added", onCommentAdded as EventListener);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            console.error("[likes] upsert:", error);
            continue;
          }
          likeInitialRef.current = true;
          if (meId !== post.user_id) {
            const peerName = post.profiles?.full_name || post.profiles?.username || "một thành viên";
            void logActivity({
              userId: meId,
              actionType: "post_like",
              description: `Bạn đã thích bài viết của ${peerName}.`,
              targetId: post.id,
              metadata: { post_id: post.id, target_name: peerName },
            });
          } else {
            try {
              await supabase
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
    setLikes((v) => Math.max(0, v + (next ? 1 : -1)));
    if (next) setLikeBurst((n) => n + 1);

    const revert = () => {
      setLiked(prevLiked);
      setLikes((v) => Math.max(0, v + (next ? -1 : 1)));
    };

    // Restriction gate — like actions may be blocked by admin.
    try {
      const { assertCanLike } = await import("@/services/restrictions.service");
      await assertCanLike();
    } catch { revert(); return; }
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

  // Buff Like tự nhiên (client-only) — cộng vào số like thật để hiển thị.
  // Vẫn giữ cột `bot_likes` (nếu có ở DB cũ) làm floor, để không giảm số vốn hiển thị.
  const _dbBotLikes = Number((post as any).bot_likes) || 0;
  const botLikes = Math.max(_dbBotLikes, _buff.buffLikes);

  return {
    post, meId, isAnonymous, isPostOwner, canDelete: !!canDelete,
    authorName, authorLocation, postTime, hasStory,
    following, followBusy,
    images, compactMedia,
    isEdited, pinnedActive, featuredActive, isLocked, lockedReason, commentsDisabled, categoryMeta,
    likes, botLikes, comments, liked, likeBurst, commentBurst, viewCount,
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
