import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images, MessageCircle, Send, X, EyeOff, Lock, HeartHandshake, Crown, ImagePlus, Play, Facebook, Gift, Sticker, Mic, Library } from "lucide-react";
import { FacebookBrandButton, ZaloBrandButton } from "@/components/candy/composer-brand-icons";
import { ComposerTextarea } from "@/components/candy/composer-textarea";

import { VoiceRecorder } from "@/components/candy/voice-recorder";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";
import {
  canSendVoice,
  uploadVoiceBlob,
  voiceToken,
  voiceVipLockMessage,
  hasVoiceToken,
  formatVoiceDuration,
} from "@/lib/voice-chat";
import { guardAction } from "@/lib/rate-limit";
import { GifPicker } from "@/components/candy/gif-picker";
// M2: removed unused ComposerEmojiPicker eager import (was pulling emoji-picker-react into the feed bundle for no reason).
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { SearchModal } from "@/components/candy/search-modal";
import { PostPendingCard } from "@/components/candy/post-pending-card";
import { FeedHeader, type SecondaryTab } from "@/components/candy/feed-header";
import { BottomSheet } from "@/components/candy/bottom-sheet";
import { Switch } from "@/components/ui/switch";
import { VideoFeedCard, type VideoFeedRow } from "@/components/candy/video-feed-card";
import { getFriendlyName, getGreetingPrompt } from "@/lib/name-format";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { PeopleYouMayKnow } from "@/components/candy/people-you-may-know";
import { CommunityPage } from "@/components/candy/community-page";
import { hasNewViewers } from "@/lib/profile-views";



/** Adapter: a legacy `videos_social` row rendered through the unified PostCard.
 *  PostMedia auto-detects video URLs so play/pause/fullscreen/audio still work.
 *  Note: interactions (like/comment/gift) on these legacy rows are best-effort;
 *  new uploads now live in `posts` so this only affects historical data. */
function videoRowToPost(v: VideoFeedRow): PostRecord {
  return {
    id: v.id,
    user_id: v.user_id,
    content: v.caption ?? "",
    image_url: v.video_url,
    image_urls: [v.video_url],
    visibility: "home",
    status: "published",
    has_images: true,
    category: "general",
    is_anonymous: false,
    created_at: v.created_at,
    profiles: (v.profiles ?? null) as any,
  } as PostRecord;
}
import { supabase } from "@/lib/supabase";
import type { PostRecord } from "@/lib/app-types";
import { createPostCompat, countTodayPosts } from "@/lib/db-compat";
import { getMediaUrl as cdnUrl, uploadPostMediaUrl } from "@/lib/media";
import { type Intent } from "@/lib/vn-provinces";
import { emitIntentChange } from "@/lib/intent-store";
import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { subscribeFeedRealtime } from "@/lib/feed-realtime";
import { LazyMount } from "@/components/candy/lazy-mount";
import { MediaItem } from "@/components/admin-v3/MediaItem";
import {
  PAGE_SIZE,

  PROFILE_FIELDS,
  fetchAdminIds as fetchAdminIdsPure,
  hydrateProfiles as hydrateProfilesPure,
  fetchFeedPage as fetchFeedPagePure,
  type FetchFeedPageResult,
  type FeedPageCursor,
} from "@/lib/feed-data";

// Pagination cho Home feed — chỉ tải 10 bài đầu, kéo xuống mới load thêm.
const VIDEO_PAGE_SIZE = 10;

// Column lists for select() queries (perf: avoid select("*")).
const VIDEOS_SOCIAL_COLS = "id, user_id, video_url, caption, created_at";
const POSTS_ADMIN_COLS = "id, user_id, content, image_url, likes_count, comments_count, created_at, image_urls, visibility, status, has_images, virtual_view_base, category, display_view_offset, is_anonymous, bot_likes, is_edited, post_code, pin_until, is_locked, comments_disabled, priority_new, bumped_at, is_pinned, is_hidden, priority_level, pinned_until, locked_at, locked_reason, priority_until, is_featured, featured_until, coin_pool_total, coin_pool_remaining, max_claimers, claimed_count, coin_per_person, reward_enabled, reward_mode, views_count, is_deleted, is_admin_post, admin_priority, is_popup, relationship_type, facebook_url, zalo_url, gif_url, pinned_at";



interface FeedPageProps {
  category?: "private" | "general";
  onViewProfile: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  /** opts.focusComments=true → mở thẳng phần bình luận của bài viết */
  onOpenPost?: (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => void;
  onOpenVideo?: (videoId: string) => void;
  /** Mở tab Kết nối FWB (page riêng) */
  onOpenFwbHub?: () => void;
  /** Mở popup Thông báo toàn cục (NotificationsPanel) */
  onOpenNotifications?: () => void;
  /** Số thông báo chưa đọc hiển thị trên chuông */
  unreadCount?: number;
}

interface CandyConfirm {
  senderId: string;
  senderName: string;
  amount: number;
}

type GeneralCategory = "fwb" | "ons" | "dating";

export function FeedPage({
  category = "general",
  onViewProfile,
  onOpenChat,
  onOpenPost,
  onOpenVideo,
  onOpenFwbHub,
  onOpenNotifications,
  unreadCount,
}: FeedPageProps) {
  const { me, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const [videos, setVideos] = useState<VideoFeedRow[]>([]);
  const [postText, setPostText] = useState("");
  // Giá trị "sống" của ô nhập (uncontrolled) — không gây re-render khi gõ.
  const postTextRef = useRef("");
  const [composerResetKey, setComposerResetKey] = useState(0);

  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const [pendingGifUrl, setPendingGifUrl] = useState<string | null>(null);
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  // ===== Composer: File đính kèm + Voice (dùng chung <VoiceRecorder /> với Chat & Bình luận) =====
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceLibOpen, setVoiceLibOpen] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<
    | { kind: "record"; blob: Blob; duration: number }
    | { kind: "library"; path: string; duration: number; title: string }
    | null
  >(null);
  const [voiceLocked, setVoiceLocked] = useState(false);

  const insertAtCursor = useCallback((insert: string, opts?: { focus?: boolean }) => {
    const el = composerTextareaRef.current;
    if (!el) {
      postTextRef.current = postTextRef.current + insert;
      setPostText(postTextRef.current);
      setComposerResetKey((k) => k + 1);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + insert + el.value.slice(end);
    el.value = next;
    postTextRef.current = next;
    setPostText(next);
    setComposerResetKey((k) => k + 1);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const caret = start + insert.length;
        el.setSelectionRange(caret, caret);
      } catch { /* noop */ }
    });
    if (opts?.focus) el.focus();
  }, []);

  /** Xoá trắng ô nhập (uncontrolled) sau khi đăng bài. */
  const clearComposerText = useCallback(() => {
    postTextRef.current = "";
    if (composerTextareaRef.current) composerTextareaRef.current.value = "";
    setPostText("");

    setComposerResetKey((k) => k + 1);
  }, []);


  const [confirmCandy, setConfirmCandy] = useState<CandyConfirm | null>(null);
  const activeCategory = category;
  const isPrivate = activeCategory === "private";
  // 24h lock chỉ áp dụng cho Tab General. Lưu trên profiles.
  const meAny = me as any;
  const lockedUntilStr: string | null =
    meAny?.category_locked_until ?? meAny?.intent_locked_until ?? null;
  const lockedCategoryRaw: string | null = (meAny?.last_relationship_category ??
    meAny?.intent ??
    null) as string | null;
  // Map giá trị legacy 'love' → 'dating' để khớp UI mới.
  const lockedCategory: GeneralCategory | null =
    lockedCategoryRaw === "love"
      ? "dating"
      : ["fwb", "ons", "dating"].includes(lockedCategoryRaw as string)
        ? (lockedCategoryRaw as GeneralCategory)
        : null;
  const lockActive = !!(lockedUntilStr && new Date(lockedUntilStr).getTime() > Date.now());
  const effectiveLocked = lockActive ? lockedCategory : null;

  // Home feed = "general" category. FWB/Dating are on their own dedicated
  // pages, so Home no longer routes posts into those buckets — that was the
  // cause of "post disappears after 5s" (optimistic insert showed "fwb", then
  // Home refetch filtered it out because Home only shows general/ons legacy).
  const [postCategory, setPostCategory] = useState<GeneralCategory | "general" | "private" | null>(
    (isPrivate ? "private" : "general") as any,
  );
  const [shakeSubmit, setShakeSubmit] = useState(false);
  const [missingCategory, setMissingCategory] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [mutualIds, setMutualIds] = useState<Set<string>>(new Set());
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [facebookUrl, setFacebookUrl] = useState<string>("");
  const [zaloUrl, setZaloUrl] = useState<string>("");
  const [fbDialogOpen, setFbDialogOpen] = useState(false);
  const [zaloDialogOpen, setZaloDialogOpen] = useState(false);
  const [fbInput, setFbInput] = useState("");
  const [zaloInput, setZaloInput] = useState("");
  // Threads-style tabs
  type FeedTab = "foryou" | "following" | "friends" | "admin";
  const [activeTab, setActiveTab] = useState<FeedTab>("foryou");
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>("fwb");
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const TAB_ORDER: FeedTab[] = ["foryou", "following", "friends", "admin"];
  // Chấm đỏ nhỏ: chỉ 1 query nhẹ khi mở app, không realtime / polling.
  const [favoriteDot, setFavoriteDot] = useState(false);
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    void hasNewViewers(me.id).then((v) => {
      if (!cancelled) setFavoriteDot(v);
    });
    return () => {
      cancelled = true;
    };
  }, [me?.id]);
  const switchTab = (t: FeedTab) => {
    if (t === activeTab) return;
    setSlideDir(TAB_ORDER.indexOf(t) > TAB_ORDER.indexOf(activeTab) ? 1 : -1);
    setActiveTab(t);
  };

  // ============ ADMIN TAB STATE ============
  type AdminPriority = "urgent" | "important" | "info";
  const [adminPosts, setAdminPosts] = useState<PostRecord[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPopup, setAdminPopup] = useState<PostRecord | null>(null);
  const [adminComposerOpen, setAdminComposerOpen] = useState(false);
  const [adminText, setAdminText] = useState("");
  const [adminTitle, setAdminTitle] = useState("");
  const [adminPriority, setAdminPriority] = useState<AdminPriority>("info");
  const [adminIsPopup, setAdminIsPopup] = useState(false);
  const [adminIsPinned, setAdminIsPinned] = useState(false);
  const [adminPosting, setAdminPosting] = useState(false);

  // Map secondary tab → category for posting / filtering.
  const tabToCategory: Record<SecondaryTab, GeneralCategory | null> = {
    important: null,
    fwb: "fwb",
    ons: "ons",
    dating: "dating",
  };
  const tabCategory = tabToCategory[secondaryTab];
  const isImportantTab = secondaryTab === "important";
  const isMeAdmin = Boolean((meAny as any)?.is_admin);
  // Thẻ thông báo "bài viết chờ Admin duyệt" (thành viên thường đăng ảnh).
  const [pendingCardOpen, setPendingCardOpen] = useState(false);

  const isMeClone = Boolean((meAny as any)?.is_clone || (meAny as any)?.is_virtual);
  const SYSTEM_HASHTAGS: Record<SecondaryTab, string | null> = {
    important: null,
    fwb: "#timfwb",
    ons: "#timons",
    dating: "#timnguoiyeu",
  };
  const systemHashtag = SYSTEM_HASHTAGS[secondaryTab];

  // Khi đổi tab hoặc khi lock thay đổi → đồng bộ category đăng bài.
  useEffect(() => {
    if (isPrivate) {
      setPostCategory("private");
    } else {
      // Secondary tabs no longer rendered on Home; always post as "general".
      setPostCategory("general" as any);
    }
    setMissingCategory(false);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.querySelector(".page-body")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, effectiveLocked, secondaryTab]);

  const previewUrls = useMemo(() => postFiles.map((f) => URL.createObjectURL(f)), [postFiles]);
  // Cleanup theo từng URL khi danh sách đổi — KHÔNG đóng URL đang hiển thị.
  const prevPreviewRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevPreviewRef.current;
    const stale = prev.filter((u) => !previewUrls.includes(u));
    stale.forEach((u) => URL.revokeObjectURL(u));
    prevPreviewRef.current = previewUrls;
  }, [previewUrls]);
  useEffect(() => () => {
    prevPreviewRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);


  const MAX_IMAGES = 10;
  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...postFiles];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_IMAGES) break;
      next.push(f);
    }
    if (Array.from(incoming).length + postFiles.length > MAX_IMAGES) {
      alert(`Chỉ được đăng tối đa ${MAX_IMAGES} ảnh mỗi bài.`);
    }
    setPostFiles(next);
  };
  const removeFile = (i: number) => setPostFiles((arr) => arr.filter((_, idx) => idx !== i));

  // ===== Pagination state (10 bài đầu, load thêm khi scroll) =====
  const [hasMoreVideos, setHasMoreVideos] = useState(true);
  const followSetRef = useRef<Set<string>>(new Set());
  const blockedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  // Cache admin authors để phối 4:1 (thành viên : admin) trên Trang Chủ.
  const adminIdsRef = useRef<string[] | null>(null);
  const ensureAdminIds = useCallback(async () => {
    if (adminIdsRef.current) return adminIdsRef.current;
    const ids = await fetchAdminIdsPure(supabase);
    adminIdsRef.current = ids;
    return ids;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Khôi phục vị trí cuộn khi user bấm Back từ /notifications về trang chủ.
  // Lưu ý: chỉ chạy 1 lần lúc mount; xoá key sau khi dùng để không bị "kẹt" sau này.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("scrollRestore:home");
      if (saved) {
        const y = parseInt(saved, 10);
        sessionStorage.removeItem("scrollRestore:home");
        if (!Number.isNaN(y) && y > 0) {
          // Đợi DOM render xong rồi cuộn (dùng rAF kép cho chắc).
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo({ top: y, behavior: "auto" });
              document.querySelector(".page-body")?.scrollTo({ top: y, behavior: "auto" });
            });
          });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fisher–Yates shuffle để trộn đều cụm bài viết mix-feed. */
  const shuffleArray = useCallback(<T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  /** Bổ sung profiles cho 1 batch posts — delegate sang module thuần. */
  const hydrateProfiles = useCallback(
    async (rows: any[]) => (await hydrateProfilesPure(rows, supabase)) as PostRecord[],
    [],
  );

  // ======================================================================
  // BƯỚC 3: Feed sang useInfiniteQuery + IntersectionObserver.
  // ======================================================================
  // queryKey tách theo tab Private/General + user hiện tại. Đổi tab hoặc
  // đăng nhập/đăng xuất → tự động remount query (không dính cache người khác).
  const feedQueryKey = useMemo(
    () => ["feed", isPrivate ? "private" : "general", me?.id ?? "anon"] as const,
    [isPrivate, me?.id],
  );

  type FeedInfinite = InfiniteData<FetchFeedPageResult, FeedPageCursor | null>;

  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchFeed,
  } = useInfiniteQuery<
    FetchFeedPageResult,
    Error,
    FeedInfinite,
    typeof feedQueryKey,
    FeedPageCursor | null
  >({
    queryKey: feedQueryKey,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      // Home feed no longer interleaves admin posts — the "Quan Trọng"
      // tab has its own dedicated feed. Keep ensureAdminIds warm for
      // that tab but don't pass admin ids into the general feed query.
      const adminIds = null;
      if (!isPrivate && me?.id) void ensureAdminIds();
      return fetchFeedPagePure({
        isPrivate,
        meId: me?.id ?? null,
        cursor: pageParam,
        pageSize: PAGE_SIZE,
        includePinned: pageParam == null,
        blockedIds: blockedRef.current,
        followSet: followSetRef.current,
        adminIds,
        client: supabase,
      });
    },
    getNextPageParam: (last) => last.nextCursor,
    // Feed cache: giữ dữ liệu 5 phút, không tự refetch khi quay lại từ
    // hồ sơ người khác / đổi tab / reconnect. Chỉ refetch khi Pull-refresh,
    // F5 hoặc bấm nút "Làm mới".
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const posts = useMemo<PostRecord[]>(
    () => (feedData?.pages.flatMap((p) => p.rows) as PostRecord[]) ?? [],
    [feedData],
  );
  const hasMorePosts = Boolean(hasNextPage);
  const loadingMore = isFetchingNextPage;

  /**
   * BƯỚC 4: mutator trực tiếp trên cache của useInfiniteQuery.
   * Realtime UPDATE/DELETE + optimistic add/remove KHÔNG còn gọi loadFeed()
   * (reload full page gây lag) — chỉ map/filter trên rows đã hydrate.
   * Toàn bộ rows sau khi map được gom về page 0, các page sau để rỗng để
   * cursor (`pageParams`) vẫn hợp lệ cho lần fetchNextPage kế tiếp.
   */
  const mutateFeed = useCallback(
    (mapper: (rows: PostRecord[]) => PostRecord[]) => {
      queryClient.setQueryData<FeedInfinite>(feedQueryKey, (old) => {
        if (!old) return old;
        const flat = old.pages.flatMap((p) => p.rows) as PostRecord[];
        const next = mapper(flat);
        const lastPage = old.pages[old.pages.length - 1];
        const pages: FetchFeedPageResult[] = old.pages.map((p, i) => {
          if (i === 0) {
            return {
              rows: next,
              hasMore: lastPage?.hasMore ?? false,
              nextCursor: lastPage?.nextCursor ?? null,
            };
          }
          return { rows: [], hasMore: false, nextCursor: p.nextCursor };
        });
        return { ...old, pages };
      });
    },
    [queryClient, feedQueryKey],
  );

  /** loadMorePosts cũ → wrapper mỏng gọi fetchNextPage(). */
  const loadMorePosts = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** Load trang đầu — chạy song song blocks + follows + videos, sau đó
   *  invalidate feed query để useInfiniteQuery tự refetch từ trang 0. */
  const loadFeed = useCallback(async () => {
    const meId = me?.id;
    const [blocksRes, followsRes, followersRes, videosRes] = await Promise.all([
      meId
        ? (supabase.from("user_blocks" as any).select("target_id").eq("blocker_id", meId) as any)
        : Promise.resolve({ data: [] }),
      meId
        ? supabase.from("follows").select("following_id").eq("follower_id", meId)
        : Promise.resolve({ data: [] as any[] }),
      meId
        ? supabase.from("follows").select("follower_id").eq("following_id", meId)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("videos_social" as any)
        .select(VIDEOS_SOCIAL_COLS)
        .order("created_at", { ascending: false })
        .range(0, VIDEO_PAGE_SIZE - 1),
    ]);

    if (!mountedRef.current) return;

    const blockedIds = new Set<string>(
      ((blocksRes as any).data as any[] | undefined)?.map((b) => b.target_id) || [],
    );
    const followSet = new Set<string>(
      ((followsRes as any).data as any[] | undefined)?.map((f) => f.following_id) || [],
    );
    const followerSet = new Set<string>(
      ((followersRes as any).data as any[] | undefined)?.map((f) => f.follower_id) || [],
    );
    const mutual = new Set<string>();
    followSet.forEach((id) => { if (followerSet.has(id)) mutual.add(id); });
    blockedRef.current = blockedIds;
    followSetRef.current = followSet;
    setFollowingIds(followSet);
    setMutualIds(mutual);

    // Xoá cache pages hiện tại → useInfiniteQuery refetch từ page 0 với
    // blockedIds/followSet mới. Không dùng invalidate + refetch riêng vì
    // refetchQueries sẽ chạy lại theo pageParams cũ (nhiều page song song).
    queryClient.setQueryData<FeedInfinite>(feedQueryKey, undefined);
    await refetchFeed();

    // Hydrate video profiles
    const videoRows = ((videosRes as any).data as any[] | undefined) || [];
    if (videoRows.length === 0) {
      setVideos([]);
      setHasMoreVideos(false);
    } else {
      const vUserIds = [...new Set(videoRows.map((r) => r.user_id).filter(Boolean))];
      const { data: vProfs } = vUserIds.length
        ? await supabase.from("profiles").select(PROFILE_FIELDS).in("id", vUserIds)
        : { data: [] as any[] };
      if (!mountedRef.current) return;
      const pmap: Record<string, any> = {};
      (vProfs || []).forEach((p: any) => { pmap[p.id] = p; });
      setVideos(videoRows.map((r) => ({ ...r, profiles: pmap[r.user_id] || null })) as VideoFeedRow[]);
      setHasMoreVideos(videoRows.length >= VIDEO_PAGE_SIZE);
    }
  }, [me?.id, queryClient, feedQueryKey, refetchFeed]);

  /** Reload nhẹ chỉ trang đầu — dùng cho realtime / refresh. */
  const loadVideos = useCallback(async () => {
    const { data: vids, error } = await supabase
      .from("videos_social" as any)
      .select(VIDEOS_SOCIAL_COLS)
      .order("created_at", { ascending: false })
      .range(0, VIDEO_PAGE_SIZE - 1);
    if (error || !mountedRef.current) return;
    const rows = (vids || []) as any[];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    let pmap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS)
        .in("id", userIds);
      (profs || []).forEach((p: any) => { pmap[p.id] = p; });
    }
    if (!mountedRef.current) return;
    setVideos(rows.map((r) => ({ ...r, profiles: pmap[r.user_id] || null })) as VideoFeedRow[]);
  }, []);

  // ============ ADMIN TAB: fetch + popup ============
  const loadAdminPosts = useCallback(async () => {
    setAdminLoading(true);
    try {
      // Ưu tiên: is_pinned → admin_priority (urgent > important > info) → created_at desc.
      // Postgrest không hiểu enum text ordering theo chiều mong muốn nên dùng CASE ở client.
      const { data, error } = await (supabase.from("posts") as any)
        .select(POSTS_ADMIN_COLS)
        .eq("is_admin_post", true)
        .order("is_pinned", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        // Nếu DB chưa migrate: fallback lọc bài từ profile is_admin=true.
        console.warn("[admin-feed] fallback:", error.message);
        const { data: adminProfs } = await supabase
          .from("profiles")
          .select("id")
          .eq("is_admin", true);
        const ids = (adminProfs || []).map((p: any) => p.id);
        if (ids.length === 0) {
          setAdminPosts([]);
          return;
        }
        const { data: rows2 } = await (supabase.from("posts") as any)
          .select(POSTS_ADMIN_COLS)
          .in("user_id", ids)
          .order("created_at", { ascending: false })
          .limit(100);
        const hydrated = await hydrateProfiles((rows2 as any[]) || []);
        setAdminPosts(hydrated);
        return;
      }
      const rows = (data as any[]) || [];
      const priRank: Record<string, number> = { urgent: 0, important: 1, info: 2 };
      rows.sort((a, b) => {
        const pa = a.is_pinned ? 0 : 1;
        const pb = b.is_pinned ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const ra = priRank[a.admin_priority ?? "info"] ?? 2;
        const rb = priRank[b.admin_priority ?? "info"] ?? 2;
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      const hydrated = await hydrateProfiles(rows);
      if (!mountedRef.current) return;
      setAdminPosts(hydrated);
    } finally {
      if (mountedRef.current) setAdminLoading(false);
    }
  }, [hydrateProfiles]);

  useEffect(() => {
    if (activeTab === "admin") {
      void loadAdminPosts();
      // Đánh dấu tất cả thông báo hiện có là đã đọc (chỉ ép người dùng xem 1 lần / bài).
      (async () => {
        try {
          const { data } = await (supabase.from("posts") as any)
            .select("id")
            .eq("is_admin_post", true);
          const ids = ((data as any[]) || []).map((r) => r.id);
          if (ids.length) {
            const seenRaw = localStorage.getItem("admin_notice_seen_v1") || "[]";
            const arr = JSON.parse(seenRaw);
            const next = Array.isArray(arr)
              ? Array.from(new Set([...arr, ...ids]))
              : ids;
            localStorage.setItem(
              "admin_notice_seen_v1",
              JSON.stringify(next.slice(-500)),
            );
            if (me?.id) {
              // Không quan trọng nếu RPC chưa được migrate — bọc try.
              try { await (supabase as any).rpc("mark_admin_notices_read", { _user_id: me.id }); } catch { /* noop */ }
            }
          }
        } catch { /* noop */ }
      })();
    }
  }, [activeTab, loadAdminPosts, me?.id]);

  // Auto-navigate sang tab "Quan trọng" MỘT LẦN DUY NHẤT / phiên,
  // nếu có bất kỳ thông báo Admin nào người dùng chưa xem.
  const autoNavigatedRef = useRef(false);
  useEffect(() => {
    if (autoNavigatedRef.current) return;
    if (activeTab === "admin") return;
    (async () => {
      try {
        const { data, error } = await (supabase.from("posts") as any)
          .select("id")
          .eq("is_admin_post", true)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return;
        const ids = ((data as any[]) || []).map((r) => r.id);
        if (ids.length === 0) return;
        const seenRaw = localStorage.getItem("admin_notice_seen_v1") || "[]";
        const seen = JSON.parse(seenRaw);
        const seenSet = new Set(Array.isArray(seen) ? seen : []);
        const hasUnread = ids.some((id) => !seenSet.has(id));
        if (hasUnread && mountedRef.current) {
          autoNavigatedRef.current = true;
          switchTab("admin");
        }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Popup Admin khi mở website — hiển thị 1 lần / bài (localStorage).
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase.from("posts") as any)
          .select(POSTS_ADMIN_COLS)
          .eq("is_admin_post", true)
          .eq("is_popup", true)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) return;
        const row = ((data as any[]) || [])[0];
        if (!row) return;
        const seenRaw = localStorage.getItem("admin_popup_seen_v1") || "[]";
        const seen = JSON.parse(seenRaw);
        if (Array.isArray(seen) && seen.includes(row.id)) return;
        const hydrated = await hydrateProfiles([row]);
        if (!mountedRef.current) return;
        setAdminPopup(hydrated[0] ?? null);
      } catch {
        /* noop */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeAdminPopup = useCallback(() => {
    if (!adminPopup) return;
    try {
      const seenRaw = localStorage.getItem("admin_popup_seen_v1") || "[]";
      const arr = JSON.parse(seenRaw);
      const next = Array.isArray(arr) ? Array.from(new Set([...arr, adminPopup.id])) : [adminPopup.id];
      localStorage.setItem("admin_popup_seen_v1", JSON.stringify(next.slice(-100)));
    } catch { /* noop */ }
    setAdminPopup(null);
  }, [adminPopup]);

  const handleAdminSubmit = useCallback(async () => {
    if (!me || !isMeAdmin) return;
    const title = adminTitle.trim();
    const body = adminText.trim();
    if (!title && !body) {
      toast.error("Nhập tiêu đề hoặc nội dung.");
      return;
    }
    setAdminPosting(true);
    try {
      // Prefix tiêu đề vào content để không cần cột riêng.
      const content = title ? `【${title}】\n${body}` : body;
      const payload: any = {
        user_id: me.id,
        content,
        visibility: "home",
        status: "published",
        category: "important",
        is_admin_post: true,
        admin_priority: adminPriority,
        is_popup: adminIsPopup,
        is_pinned: adminIsPinned,
        pinned_until: adminIsPinned ? new Date(Date.now() + 7 * 24 * 3600_000).toISOString() : null,
      };
      const { error } = await (supabase.from("posts") as any).insert(payload);
      if (error) throw error;
      toast.success("Đã đăng thông báo Admin.");
      setAdminText("");
      setAdminTitle("");
      setAdminPriority("info");
      setAdminIsPopup(false);
      setAdminIsPinned(false);
      setAdminComposerOpen(false);
      void loadAdminPosts();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Không thể đăng bài Admin."));
    } finally {
      setAdminPosting(false);
    }
  }, [me, isMeAdmin, adminTitle, adminText, adminPriority, adminIsPopup, adminIsPinned, loadAdminPosts]);



  // Trạng thái Realtime để debug khi Feed không tự cập nhật.
  const [rtStatus, setRtStatus] = useState<"connecting" | "live" | "error" | "closed">("connecting");
  const [rtLastEvent, setRtLastEvent] = useState<string | null>(null);
  // "Có N bài viết mới" — bộ đếm bài mới xuất hiện lúc user đang đọc.
  const [newPostsCount, setNewPostsCount] = useState(0);
  const newPostsIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadFeed();

    // BƯỚC 4: UPDATE/DELETE cập nhật trực tiếp cache qua mutateFeed →
    // KHÔNG cần debounce reload full page nữa. Chỉ còn videos reload debounced.
    let videoTimer: number | undefined;
    const scheduleVideoReload = () => {
      if (videoTimer) window.clearTimeout(videoTimer);
      videoTimer = window.setTimeout(() => {
        if (mountedRef.current) void loadVideos();
      }, 800);
    };

    // Feed-scope realtime singleton: ONE channel shared by all feed instances.
    // Tab switches / remounts only add/remove subscribers; the underlying
    // Supabase channel is created once and torn down when the last feed
    // consumer unmounts.
    const off = subscribeFeedRealtime({
      onPostInsert: (row) => {
        setRtLastEvent(`INSERT • ${new Date().toLocaleTimeString("vi-VN")}`);
        const id = row?.id as string | undefined;
        const userId = row?.user_id as string | undefined;
        if (!id) return;
        if (me?.id && userId === me.id) return;
        if (newPostsIdsRef.current.has(id)) return;
        newPostsIdsRef.current.add(id);
        setNewPostsCount(newPostsIdsRef.current.size);
      },
      onPostUpdate: (row) => {
        setRtLastEvent(`UPDATE • ${new Date().toLocaleTimeString("vi-VN")}`);
        // BƯỚC 4: cập nhật trực tiếp cache — không reload full page.
        // Merge field mới lên bài đang có trong cache; profile giữ nguyên.
        const id = (row as { id?: string } | undefined)?.id;
        if (!id) return;
        mutateFeed((prev) =>
          prev.map((p) =>
            p.id === id ? ({ ...p, ...(row as object) } as PostRecord) : p,
          ),
        );
      },
      onPostDelete: (row) => {
        setRtLastEvent(`DELETE • ${new Date().toLocaleTimeString("vi-VN")}`);
        const id = (row as { id?: string } | undefined)?.id;
        if (!id) return;
        mutateFeed((prev) => prev.filter((p) => p.id !== id));
      },
      onVideoChange: () => {
        scheduleVideoReload();
      },
      onStatus: (status) => {
        if (status === "SUBSCRIBED") setRtStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRtStatus("error");
        else if (status === "CLOSED") setRtStatus("closed");
        else setRtStatus("connecting");
      },
    });

    return () => {
      if (videoTimer) window.clearTimeout(videoTimer);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, me?.id]);

  // ======================================================================
  // Admin purge: xóa toàn bộ bài viết → mọi client xoá sạch cache NGAY.
  // Không đợi tương tác, không giữ dữ liệu cũ trong React Query.
  // ======================================================================
  useEffect(() => {
    let off = () => {};
    const purge = async () => {
      // 1) Reset state cục bộ để UI không giữ danh sách cũ.
      newPostsIdsRef.current.clear();
      setNewPostsCount(0);
      setVideos([]);
      setHasMoreVideos(false);
      // 2) Xoá TOÀN BỘ cache React Query (feed, posts, profile-posts…).
      try {
        await queryClient.cancelQueries();
        queryClient.removeQueries();
        queryClient.clear();
      } catch { /* noop */ }
      // 3) Ép feed query hiện tại về pages rỗng để render trống ngay.
      try {
        queryClient.setQueryData<FeedInfinite>(feedQueryKey, {
          pages: [{ rows: [], hasMore: false, nextCursor: null }],
          pageParams: [null],
        } as FeedInfinite);
      } catch { /* noop */ }
      // 4) Bắt useInfiniteQuery reset observer rồi refetch page 0 từ DB.
      try {
        await queryClient.resetQueries({ queryKey: ["feed"] });
      } catch { /* noop */ }
      try {
        await refetchFeed();
      } catch { /* noop */ }
      // 5) Reload video/follow/block để mọi surface đồng bộ với DB.
      void loadFeed();
    };
    const onWin = () => { void purge(); };
    window.addEventListener("feed:refresh", onWin);
    window.addEventListener("admin:purge", onWin);
    void (async () => {
      const { onAdminPurge } = await import("@/lib/admin-broadcast");
      off = onAdminPurge((kind) => {
        if (kind === "posts") void purge();
        if (kind === "accounts") window.location.reload();
      });
    })();
    return () => {
      window.removeEventListener("feed:refresh", onWin);
      window.removeEventListener("admin:purge", onWin);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, loadFeed, feedQueryKey, refetchFeed]);


  /** Người dùng bấm thanh "Có N bài viết mới" — reload trang đầu + cuộn lên. */
  const handleLoadNewPosts = useCallback(async () => {
    newPostsIdsRef.current.clear();
    setNewPostsCount(0);
    await loadFeed();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [loadFeed]);


  // Cấp VIP của user hiện tại — VIP 5 trở lên: mở khoá nhiều bài/ngày.
  const myVip = (me as any)?.vip_level ?? 0;
  const isVipUnlocked = myVip >= 5;
  const VIP_DAILY_CAP = 20;
  const FREE_DAILY_CAP = 5;
  const dailyCap = isVipUnlocked ? VIP_DAILY_CAP : FREE_DAILY_CAP;

  // ===== Quota "một đi không trở lại" — đếm trên localStorage, KHÔNG giảm khi xoá bài.
  const todayKey = useMemo(() => {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return me?.id ? `post_quota_used:${me.id}:${ymd}` : "";
  }, [me?.id]);
  const [usedToday, setUsedToday] = useState<number>(0);
  useEffect(() => {
    if (!todayKey) {
      setUsedToday(0);
      return;
    }
    const stored = parseInt(localStorage.getItem(todayKey) || "", 10);
    if (Number.isFinite(stored) && stored > 0) {
      setUsedToday(stored);
      return;
    }
    // Seed lần đầu trong ngày từ DB để không bị reset khi user vừa F5.
    if (me?.id) {
      void countTodayPosts(me.id).then((q) => {
        const seed = (q.text || 0) + (q.image || 0);
        if (seed > 0) localStorage.setItem(todayKey, String(seed));
        setUsedToday(seed);
      });
    }
  }, [todayKey, me?.id]);
  const bumpUsed = () => {
    setUsedToday((prev) => {
      const next = prev + 1;
      if (todayKey) localStorage.setItem(todayKey, String(next));
      return next;
    });
  };
  const remaining = Math.max(0, dailyCap - usedToday);
  const blocked = remaining <= 0;
  const blockedMessage = `Bạn đã sử dụng hết ${dailyCap} lượt đăng bài hôm nay. ${
    isVipUnlocked ? "Vui lòng quay lại vào ngày mai!" : "Hãy nâng cấp VIP 5 để tăng giới hạn."
  }`;

  // Giữ tên cũ để không phải sửa nhiều — isOnsMode == đang ở Tab Private.
  const isOnsMode = isPrivate;

  const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
  const MAX_VIDEO_DURATION = 30;
  const VIDEO_SIZE_MSG = `Tài khoản của bạn hiện chỉ đăng được video dài tối đa ${MAX_VIDEO_DURATION} giây.`;
  const VIDEO_DURATION_MSG = `Tài khoản của bạn hiện chỉ đăng được video dài tối đa ${MAX_VIDEO_DURATION} giây.`;

  const probeDuration = (file: File) =>
    new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => { const d = v.duration || 0; URL.revokeObjectURL(url); resolve(d); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    });



  const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Chỉ Admin được phép đăng video — defensive guard, không chỉ dựa vào UI.
    setVideoError(null);
    if (!file.type.startsWith("video/")) { setVideoError("Vui lòng chọn tệp video."); return; }
    if (file.size > MAX_VIDEO_BYTES) { setVideoError(VIDEO_SIZE_MSG); return; }
    const dur = await probeDuration(file);
    if (dur && dur > MAX_VIDEO_DURATION) { setVideoError(VIDEO_DURATION_MSG); return; }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    if (postFiles.length > 0) setPostFiles([]); // video & ảnh loại trừ nhau
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
  };


  const clearVideo = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoError(null);
  };

  /** Bước 1: kiểm tra điều kiện và (nếu cần) yêu cầu chọn nhu cầu trước khi đăng. */
  const handleSubmit = async () => {
    if (!me) return alert("Bạn cần đăng nhập trước.");
    if (!postCategory) {
      setMissingCategory(true);
      setShakeSubmit(true);
      window.setTimeout(() => setShakeSubmit(false), 600);
      return;
    }
    setMissingCategory(false);
    // Ảnh/Video của thành viên thường: mô phỏng "đã gửi phê duyệt".
    // Không upload, không tạo bài viết, không ghi database — chỉ trừ 1 lượt đăng.
    if (!isMeAdmin && (postFiles.length > 0 || videoFile)) {
      setPosting(true);
      await new Promise((r) => window.setTimeout(r, 1200));
      setPosting(false);
      bumpUsed();
      setPostFiles([]);
      clearVideo();
      setPendingGifUrl(null);
      setPendingVoice(null);
      clearComposerText();
      setComposerOpen(false);
      toast.success("Bài viết đã được gửi đi phê duyệt.", { duration: 5000 });
      return;
    }

    // Gate VIP cho Voice: chỉ kiểm tra tại bước "Đăng bài".
    // Admin + Clone luôn được phép; user thường phải là VIP.
    if (pendingVoice && !isMeAdmin && !isMeClone && !canSendVoice(me)) {
      setVoiceLocked(true);
      return;
    }
    if (videoFile) {
      // Video: cho phép caption rỗng — y hệt luồng đăng ảnh.
    } else if (
      !postTextRef.current.trim() &&

      postFiles.length === 0 &&
      !pendingGifUrl &&
      !pendingVoice
    ) {
      return alert("Nhập nội dung hoặc chọn ảnh/video.");
    }



    if (blocked) {
      toast.error(blockedMessage, { duration: 6000 });
      return;
    }

    const shouldLockRelationshipCategory =
      !isOnsMode &&
      !lockActive &&
      postCategory !== "general" &&
      postCategory !== "private";

    if (shouldLockRelationshipCategory) {
      const { data, error } = await supabase.rpc("set_relationship_category_with_lock" as any, {
        p_category: postCategory,
      });
      if (error) {
        if ((error.message || "").includes("CATEGORY_LOCKED_UNTIL")) {
          toast.error("Mục tiêu đã bị khoá 24 giờ — không thể đổi.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      emitIntentChange(me.id, postCategory as Intent);
      void refreshMe();
      // Không hiển thị toast "Đã khoá mục tiêu ..." — flow đăng bài giữ im lặng.
    }

    await doCreatePost();
  };

  const doCreatePost = async () => {
    if (!me || !postCategory) return;

    // Bot từ cấm: chỉ áp dụng cho user thường, admin được bỏ qua.
    const isAdmin = Boolean((meAny as any)?.is_admin);
    if (!isAdmin) {
      const caption = (postTextRef.current || "").trim();
      if (caption) {
        try {
          const { data: matched, error: scanErr } = await supabase.rpc(
            "scan_post_keywords" as any,
            { _content: caption },
          );
          if (!scanErr && matched === true) {
            toast.error(
              "Bài viết của bạn chứa từ ngữ vi phạm tiêu chuẩn cộng đồng! Bài viết đã bị hủy và tài khoản của bạn đã bị trừ điểm uy tín. (Lưu ý: Điểm uy tín dưới 70 sẽ bị khóa tài khoản vĩnh viễn).",
              { duration: 8000 },
            );
            void refreshMe();
            return;
          }
        } catch {
          /* RPC lỗi → không chặn người dùng */
        }
      }
    }

    // ===== OPTIMISTIC UI =====
    // Snapshot đầu vào để rollback nếu upload/insert lỗi.
    const appendSystemHashtag = (raw: string) => (raw || "").trim();
    const snapshotText = postTextRef.current;
    const snapshotFiles = postFiles.slice();
    const snapshotVideoFile = videoFile;
    const snapshotAnonymous = postAnonymous;
    const snapshotGif = pendingGifUrl;
    const snapshotVoice = pendingVoice;
    const isVideoFlow = Boolean(videoFile);

    // Bài có ảnh/video của thành viên thường → chờ Admin duyệt.
    // Thành viên VIP (và Admin) → hiển thị ngay.
    const hasMedia = isVideoFlow || snapshotFiles.length > 0;
    const isVipMember = isMeAdmin || Number((me as any)?.vip_level ?? 0) >= 1;
    const needsApproval = hasMedia && !isVipMember;
    const postStatus: "pending" | "published" = needsApproval ? "pending" : "published";

    const localPreviewUrls: string[] = isVideoFlow
      ? (videoPreviewUrl ? [videoPreviewUrl] : [])
      : [
          ...snapshotFiles.map((f) => URL.createObjectURL(f)),
          ...(snapshotGif ? [snapshotGif] : []),
        ];

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const displayContent = appendSystemHashtag(
      snapshotText.trim() ||
        (isVideoFlow ? "🎬" : snapshotVoice ? "🎙️" : "📷"),
    );
    const tempPost: PostRecord = {
      id: tempId,
      user_id: me.id,
      content: displayContent,
      image_url: localPreviewUrls[0] ?? null,
      image_urls: localPreviewUrls.length > 0 ? localPreviewUrls : null,
      visibility: "home",
      status: postStatus,
      has_images: localPreviewUrls.length > 0,
      category: postCategory === "dating" ? "dating" : (postCategory as any),
      is_anonymous: isOnsMode && snapshotAnonymous,
      created_at: new Date().toISOString(),
      profiles: (meAny as any) ?? null,
    } as PostRecord;

    // Prepend ngay lập tức + đóng composer + clear input.
    // Bài chờ duyệt thì KHÔNG hiện lên feed.
    if (!needsApproval) mutateFeed((prev) => [tempPost, ...prev]);

    if (isVideoFlow) {
      clearVideo();
    } else {
      setPostFiles([]);
    }
    clearComposerText();
    setPostAnonymous(false);
    setPendingGifUrl(null);
    setPendingVoice(null);
    setComposerOpen(false);
    setPosting(true);
    const snapshotFacebook = facebookUrl.trim();
    const snapshotZalo = zaloUrl.trim();
    setFacebookUrl("");
    setZaloUrl("");

    // Background upload + insert. Không block UI.
    void (async () => {
      try {
        let createdId: string | null = null;
        if (isVideoFlow && snapshotVideoFile) {
          const url = await uploadPostMediaUrl(snapshotVideoFile, { isAdmin: isMeAdmin, kind: "video" });
          const res = await createPostCompat(me.id, displayContent, url, {
            imageUrls: [url],
            visibility: "home",
            status: postStatus,
            category: postCategory === "dating" ? "dating" : postCategory,
            isAnonymous: isOnsMode && snapshotAnonymous,
            facebookUrl: snapshotFacebook || null,
            zaloUrl: snapshotZalo || null,
          });
          createdId = res?.id ?? null;
        } else {
          const urls: string[] = [];
          for (const f of snapshotFiles.slice(0, MAX_IMAGES)) {
            const raw = await uploadPostMediaUrl(f, { isAdmin: isMeAdmin, kind: "post" });
            urls.push(cdnUrl(raw));
          }
          if (snapshotGif) urls.push(snapshotGif);

          // Voice: user thường/admin ghi âm → upload; clone dùng Voice Library.
          let finalContent = displayContent;
          if (snapshotVoice) {
            const path =
              snapshotVoice.kind === "library"
                ? snapshotVoice.path
                : await uploadVoiceBlob(me.id, snapshotVoice.blob);
            finalContent = `${finalContent}\n${voiceToken(path, snapshotVoice.duration)}`;
          }

          const res = await createPostCompat(me.id, finalContent, urls[0] ?? null, {

            imageUrls: urls,
            visibility: "home",
            status: postStatus,
            category: postCategory === "dating" ? "dating" : postCategory,
            isAnonymous: isOnsMode && snapshotAnonymous,
            facebookUrl: snapshotFacebook || null,
            zaloUrl: snapshotZalo || null,
          });
          createdId = res?.id ?? null;
        }

        void createdId;


        if (needsApproval) setPendingCardOpen(true);
        else toast.success("Đã đăng thành công");
        bumpUsed();

        // Invalidate cache (không block UI của user).
        void queryClient.invalidateQueries({ queryKey: ["posts"] });
        void queryClient.invalidateQueries({ queryKey: ["feed"] });
        void queryClient.invalidateQueries({ queryKey: ["profile-posts"] });

        // Refetch nền — sẽ thay temp bằng dữ liệu thật.
        await loadFeed();
      } catch (error) {
        // Rollback: gỡ temp + khôi phục input để user thử lại.
        mutateFeed((prev) => prev.filter((p) => p.id !== tempId));
        setPostText(snapshotText);
        if (isVideoFlow) {
          // Video file bị clear — chỉ khôi phục caption + báo lỗi.
        } else {
          setPostFiles(snapshotFiles);
          setPendingVoice(snapshotVoice);
        }
        setPostAnonymous(snapshotAnonymous);
        toast.error(toUserMessage(error, "Không đăng được bài, vui lòng thử lại."));
      } finally {
        // Revoke blob URLs (image previews only — không revoke video preview đã bị clearVideo xử lý).
        if (!isVideoFlow) {
          localPreviewUrls.forEach((u) => {
            try { URL.revokeObjectURL(u); } catch { /* */ }
          });
        }
        setPosting(false);
      }
    })();
  };

  // Định dạng thời gian còn lại của khoá 24h.
  const lockRemainingText = useMemo(() => {
    if (!lockActive || !lockedUntilStr) return "";
    const ms = new Date(lockedUntilStr).getTime() - Date.now();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h >= 1 ? `${h} giờ ${m} phút` : `${m} phút`;
  }, [lockActive, lockedUntilStr]);

  // Flattened layout: render as a fragment so the feed shares the .page-body
  // scroll context (no extra Card / scroll container that would cause nested
  // scrolling lag on mobile).
  // "Quan Trọng" tab was removed. Any lingering "admin" secondary tab
  // falls through to the default feed render.

  // ---- Perf: derive the merged feed list once per data change (not per keystroke) ----
  type FeedItem =
    | { kind: "post"; id: string; created_at: string; data: PostRecord }
    | { kind: "video"; id: string; created_at: string; data: VideoFeedRow };

  const filteredItems = useMemo<FeedItem[]>(() => {
    // Gộp posts + videos thành 1 luồng theo created_at desc.
    const feedItems: FeedItem[] = [
      ...posts.map((p) => ({
        kind: "post" as const,
        id: `p_${p.id}`,
        created_at: p.created_at || "",
        data: p,
      })),
      ...(isPrivate
        ? []
        : videos.map((v) => ({
            kind: "video" as const,
            id: `v_${v.id}`,
            created_at: v.created_at || "",
            data: v,
          }))),
    ].sort((a, b) => {
      // BÀI GHIM LUÔN ĐỨNG ĐẦU: is_pinned → pinned_at desc → created_at desc.
      const ap = a.kind === "post" && (a.data as any).is_pinned === true ? 1 : 0;
      const bp = b.kind === "post" && (b.data as any).is_pinned === true ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (ap === 1) {
        const at = new Date((a.data as any).pinned_at || a.created_at || 0).getTime();
        const bt = new Date((b.data as any).pinned_at || b.created_at || 0).getTime();
        if (at !== bt) return bt - at;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });


    // Topic separation removed — feed is a single unified stream regardless
    // of post `category`. We still respect the primary tab (foryou/following/friends).
    return feedItems.filter((it) => {
      const uid = (it.data as any).user_id;
      if (activeTab === "foryou") return true;
      if (!uid) return false;
      // "Theo Dõi": chỉ bài của người mình đang follow, LOẠI bài của chính mình.
      if (activeTab === "following") return followingIds.has(uid) && uid !== me?.id;
      if (activeTab === "friends") return mutualIds.has(uid);
      return true;
    });
  }, [posts, videos, isPrivate, activeTab, followingIds, mutualIds, me?.id]);

  const handlePostRemoved = useCallback(
    (id: string) => mutateFeed((prev) => prev.filter((p) => p.id !== id)),
    [mutateFeed],
  );
  const handleVideoRemoved = useCallback(
    (id: string) => setVideos((prev) => prev.filter((vv) => vv.id !== id)),
    [],
  );

  // Tab "Vào Cộng Đồng" — trang giới thiệu do Admin quản lý (thay tab "Yêu thích").
  const isCommunityTab: boolean = activeTab === "following";
  if (isCommunityTab) {
    return (
      <>
        <FeedHeader
          primary="community"
          onPrimaryChange={(p) => {
            if (p !== "community") switchTab("foryou");
          }}
        />
        <CommunityPage />
      </>
    );
  }

  return (

    <>



      <FeedHeader
        favoriteDot={favoriteDot}
        primary="foryou"
        onPrimaryChange={(p) => {
          if (p === "community") switchTab("following");
          else if (p === "admin") switchTab("admin");
          else switchTab("foryou");
        }}
        secondary={secondaryTab}
        onSecondaryChange={setSecondaryTab}
        onSearch={() => setSearchOpen(true)}
        onNotifications={() => onOpenNotifications?.()}
        notificationCount={unreadCount}
      />


      <PostPendingCard open={pendingCardOpen} onClose={() => setPendingCardOpen(false)} />

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onViewProfile={onViewProfile}
        onOpenPost={onOpenPost}
      />




      {/* Composer trigger: ẨN khi ở tab "Theo Dõi". Tab "💕 Tìm FWB" render
          bởi <FwbFeedPage /> (early-return ở trên). */}
      <>
        {activeTab !== "following" ? (

          <div className="composer-trigger-wrap">
            <button
              type="button"
              className="composer-trigger"
              onClick={() => setComposerOpen(true)}
              aria-label="Tạo bài viết mới"
            >
              <img loading="lazy" decoding="async"
                src={getValidAvatarUrl((meAny as any)?.avatar)}
                onError={handleAvatarError}
                alt=""
                className="composer-trigger__avatar"
              />
              <span className="composer-trigger__field">
                <span className="composer-trigger__text">Chia sẻ điều gì đó…</span>
              </span>
              <span className="composer-trigger__quick">
                <span className="composer-trigger__ico composer-trigger__ico--photo" aria-hidden>
                  <ImagePlus size={17} />
                </span>
                <span className="composer-trigger__ico composer-trigger__ico--video" aria-hidden>
                  <Play size={17} />
                </span>
                <span className="composer-trigger__ico composer-trigger__ico--gif" aria-hidden title="GIF / Sticker">
                  <Sticker size={17} />
                </span>
              </span>
              <span className="composer-trigger__cta">Đăng</span>
            </button>
          </div>

        ) : null}
        <BottomSheet
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          title="Tạo bài viết"
          leftAction={
            <button
              type="button"
              className="bsheet-cancel"
              onClick={() => setComposerOpen(false)}
            >
              Hủy
            </button>
          }
          rightAction={
            <button
              type="button"
              className={`composer-submit-premium ${shakeSubmit ? "shake-once" : ""}`}
              onClick={() => void handleSubmit()}
              disabled={posting || blocked}
              title={blocked ? blockedMessage : undefined}
              style={{ height: 34, padding: "0 14px", fontSize: 13 }}
            >
              <Send size={13} strokeWidth={2.4} />
              <span>{posting ? "Đang đăng..." : blocked ? "Hết lượt" : "Đăng"}</span>
            </button>
          }
        >
      <section className="composer-card composer-threads stack-sm rounded-3xl" style={{ border: 0, background: "transparent", padding: 0 }}>
        {/* Personalized greeting header — Avatar + tên cá nhân hoá */}
        <div
          className="flex items-center gap-3"
          style={{ paddingBottom: 4 }}
        >
          <img loading="lazy" decoding="async"
            src={getValidAvatarUrl((meAny as any)?.avatar)}
            onError={handleAvatarError}
            alt={getFriendlyName(meAny?.full_name, meAny?.username)}
            className="rounded-full"
            style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {getGreetingPrompt(meAny?.full_name, meAny?.username)}
            </div>
          </div>
        </div>
        <ComposerTextarea
          taRef={composerTextareaRef}
          valueRef={postTextRef}
          resetKey={composerResetKey}
          maxChars={250}
          placeholder={
            isPrivate
              ? "Chia sẻ điều riêng tư của bạn (Private)…"
              : getGreetingPrompt(meAny?.full_name, meAny?.username)
          }
          onDebouncedChange={setPostText}
        />


        {/* Thanh chọn danh mục (Tìm FWB / Tìm ONS / Hẹn hò) đã được ẩn theo yêu cầu. */}

        {/* Nút gạt Đăng ẩn danh — chỉ hiện ở mục 18+ (ONS). */}
        {isOnsMode ? (
          <div
            className="rounded-3xl"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              border: `1px solid ${postAnonymous ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
              background: postAnonymous ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
              fontSize: 13,
              fontWeight: 600,
              alignSelf: "flex-start",
            }}
          >
            <EyeOff size={14} />
            <label htmlFor="anon-toggle" style={{ cursor: "pointer" }}>
              Đăng ẩn danh
            </label>
            <Switch id="anon-toggle" checked={postAnonymous} onCheckedChange={setPostAnonymous} />
            <span className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
              · vẫn nhận Coin/Gem bình thường
            </span>
          </div>
        ) : null}

        {videoPreviewUrl ? (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <video
              src={videoPreviewUrl}
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="w-full rounded-xl border border-border bg-black"
              style={{ maxHeight: 280 }}
            />
            <button
              type="button"
              className="icon-button danger-button"
              onClick={clearVideo}
              title="Bỏ video"
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        {videoError ? (
          <p style={{ color: "hsl(var(--destructive))", fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
            {videoError}
          </p>
        ) : null}

        {previewUrls.length > 0 ? (
          <div className="composer-thumbs">
            {previewUrls.map((u, i) => (
              <div key={u} className="composer-thumb">
                <img loading="lazy" decoding="async" src={u} alt={`Xem trước ${i + 1}`} />
                <button
                  type="button"
                  className="composer-thumb-remove"
                  onClick={() => removeFile(i)}
                  aria-label="Bỏ ảnh"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {pendingGifUrl ? (
          <div className="composer-thumbs">
            <div className="composer-thumb" style={{ position: "relative" }}>
              <MediaItem url={pendingGifUrl} alt="GIF đã chọn" />
              <button
                type="button"
                className="composer-thumb-remove"
                onClick={() => setPendingGifUrl(null)}
                aria-label="Bỏ GIF"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : null}



        {/* Ghi âm giọng nói — cùng component với Chat & Bình luận */}
        {recordingVoice ? (
          <div className="composer-row">
            <VoiceRecorder
              compact
              onCancel={() => setRecordingVoice(false)}
              onSend={(blob, duration) => {
                // Không kiểm tra VIP ở đây — chỉ kiểm tra khi bấm "Đăng bài".
                setPendingVoice({ kind: "record", blob, duration });
                setRecordingVoice(false);
              }}
            />
          </div>
        ) : null}

        {pendingVoice ? (
          <div className="composer-row">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px]">
              <Mic size={13} />
              <span className="truncate max-w-[180px]">
                {pendingVoice.kind === "library" ? pendingVoice.title : "Tin nhắn thoại"}
              </span>
              <span className="tabular-nums opacity-70">
                {formatVoiceDuration(pendingVoice.duration)}
              </span>
              <button type="button" aria-label="Bỏ voice" onClick={() => setPendingVoice(null)}>
                <X size={12} />
              </button>
            </span>
          </div>
        ) : null}

        <VoiceLibraryPicker
          open={voiceLibOpen}
          manage={isMeAdmin}
          onClose={() => setVoiceLibOpen(false)}
          onPick={(item) => {
            setPendingVoice({
              kind: "library",
              path: item.storage_path,
              duration: item.duration,
              title: item.title,
            });
            setVoiceLibOpen(false);
          }}
        />

        <ZaloVipLockModal
          open={voiceLocked}
          title="Tin nhắn thoại dành cho thành viên VIP"
          message={voiceVipLockMessage(me)}
          onClose={() => setVoiceLocked(false)}
        />

        {/* Premium single-row action bar */}
        <div className="composer-row composer-row-actions composer-row--premium">
          <div className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:bg-white/[0.03]">
            {/* LEFT: icon tools */}
            <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
              <label
                className="composer-icon-btn !h-9 !w-9 !rounded-xl flex items-center justify-center cursor-pointer transition hover:bg-primary/15 hover:text-primary"
                title={`Chọn ảnh (tối đa ${MAX_IMAGES})`}
                aria-label="Chọn ảnh"
              >
                <Images size={18} />
                <input
                  ref={videoInputRef}
                  type="file"
                  // Hệ thống hiện chỉ hỗ trợ đăng tải hình ảnh.
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const video = files.find((f) => f.type.startsWith("video/"));
                    if (video) {
                      toast("Hệ thống hiện tại chỉ hỗ trợ đăng tải hình ảnh.", { duration: 3000 });
                      e.currentTarget.value = "";
                      return;
                    }
                    addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <FacebookBrandButton
                onClick={() => { setFbInput(facebookUrl); setFbDialogOpen(true); }}
                active={Boolean(facebookUrl)}
                title={facebookUrl ? `Facebook: ${facebookUrl}` : "Thêm Facebook"}
                ariaLabel="Thêm Facebook"
              />
              <ZaloBrandButton
                onClick={() => { setZaloInput(zaloUrl); setZaloDialogOpen(true); }}
                active={Boolean(zaloUrl)}
                title={zaloUrl ? `Zalo: ${zaloUrl}` : "Thêm Zalo"}
                ariaLabel="Thêm Zalo"
              />

              {/* GIF / Sticker / Icon — reuse existing shared picker */}
              <div style={{ position: "relative" }}>
                <button
                  ref={gifBtnRef}
                  type="button"
                  className={`composer-icon-btn !h-9 !w-9 !rounded-xl flex items-center justify-center transition hover:bg-primary/15 hover:text-primary${gifPickerOpen ? " is-active" : ""}`}
                  title="GIF / Sticker / Icon"
                  aria-label="Chèn GIF"
                  onClick={() => setGifPickerOpen((v) => !v)}
                >
                  <Sticker size={18} />
                </button>
                <GifPicker
                  open={gifPickerOpen}
                  onClose={() => setGifPickerOpen(false)}
                  anchorRef={gifBtnRef}
                  onPick={(url) => {
                    setGifPickerOpen(false);
                    setPendingGifUrl(url);
                  }}
                />
              </div>




              {/* 🎙 Voice — luôn hiển thị trên thanh công cụ */}
              <button
                type="button"
                data-testid="composer-voice-btn"
                className={`composer-icon-btn !h-9 !w-9 !rounded-xl flex items-center justify-center transition hover:bg-primary/15 hover:text-primary${recordingVoice || pendingVoice ? " is-active" : ""}`}
                title={isMeClone ? "Thư viện voice" : "Tin nhắn thoại"}
                aria-label="Ghi âm giọng nói"
                onClick={() => {
                  if (pendingVoice || hasVoiceToken(postTextRef.current)) {
                    toast.error("Mỗi bài viết chỉ được đính kèm 1 tin nhắn thoại");
                    return;
                  }
                  if (isMeClone) {
                    setVoiceLibOpen(true);
                    return;
                  }
                  setRecordingVoice((v) => !v);
                }}
              >
                {isMeClone ? <Library size={18} /> : <Mic size={18} />}
              </button>

            </div>



            {/* RIGHT: system hashtag + remaining */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Hashtag hệ thống đã được gỡ — không hiển thị tag mặc định. */}
              <span
                className="text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap tabular-nums"
                title={`Còn ${remaining}/${dailyCap} lượt đăng hôm nay`}
              >
                Còn {remaining}/{dailyCap} lượt
              </span>
            </div>
          </div>
          <button
            className={`composer-submit-premium ${shakeSubmit ? "shake-once" : ""}`}
            onClick={() => void handleSubmit()}
            disabled={posting || blocked}
            title={blocked ? blockedMessage : undefined}
          >
            <Send size={15} strokeWidth={2.4} />
            <span>{posting ? "Đang đăng..." : blocked ? "Hết lượt" : "Đăng bài"}</span>
          </button>
        </div>
        {blocked ? (
          <p className="composer-hint" style={{ color: "hsl(var(--destructive))", marginTop: 4 }}>
            ⛔ {blockedMessage}
          </p>
        ) : null}
      </section>
        </BottomSheet>


        {fbDialogOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setFbDialogOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "hsl(var(--card))", borderRadius: 16, padding: 20, border: "1px solid hsl(var(--border))" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <strong style={{ fontSize: 15 }}>Thêm Facebook</strong>
                <button type="button" onClick={() => setFbDialogOpen(false)} aria-label="Đóng" style={{ background: "transparent", border: 0, cursor: "pointer" }}><X size={16} /></button>
              </div>
              <input
                autoFocus
                className="app-input"
                placeholder="https://facebook.com/username hoặc username"
                value={fbInput}
                onChange={(e) => setFbInput(e.target.value)}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                {facebookUrl ? (
                  <button type="button" className="lm-btn lm-btn--ghost" onClick={() => { setFacebookUrl(""); setFbDialogOpen(false); }}>Gỡ</button>
                ) : null}
                <button type="button" className="lm-btn lm-btn--primary" onClick={() => { setFacebookUrl(fbInput.trim()); setFbDialogOpen(false); }}>Lưu</button>
              </div>
            </div>
          </div>
        ) : null}

        {zaloDialogOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setZaloDialogOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "hsl(var(--card))", borderRadius: 16, padding: 20, border: "1px solid hsl(var(--border))" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <strong style={{ fontSize: 15 }}>Thêm Zalo</strong>
                <button type="button" onClick={() => setZaloDialogOpen(false)} aria-label="Đóng" style={{ background: "transparent", border: 0, cursor: "pointer" }}><X size={16} /></button>
              </div>
              <input
                autoFocus
                className="app-input"
                placeholder="Số điện thoại hoặc https://zalo.me/..."
                value={zaloInput}
                onChange={(e) => setZaloInput(e.target.value)}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                {zaloUrl ? (
                  <button type="button" className="lm-btn lm-btn--ghost" onClick={() => { setZaloUrl(""); setZaloDialogOpen(false); }}>Gỡ</button>
                ) : null}
                <button type="button" className="lm-btn lm-btn--primary" onClick={() => { setZaloUrl(zaloInput.trim()); setZaloDialogOpen(false); }}>Lưu</button>
              </div>
            </div>
          </div>
        ) : null}
      </>


      {/* PeopleYouMayKnow block removed per request — no suggestion box between composer and feed. */}


      <section className={`stack-md feed-threads threads-slide threads-slide-${slideDir > 0 ? "right" : "left"}`} key={activeTab}>
        {newPostsCount > 0 ? (
          <div
            className="sticky top-2 z-40 mx-auto flex w-fit"
            style={{ animation: "newPostsPillIn 220ms ease-out both" }}
          >
            <button
              type="button"
              onClick={() => void handleLoadNewPosts()}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-lg hover:shadow-xl active:scale-95 transition"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent, var(--primary))))",
                boxShadow: "0 8px 22px -6px hsl(var(--primary) / 0.55)",
              }}
              aria-label={`Có ${newPostsCount} bài viết mới`}
            >
              <span aria-hidden style={{ fontSize: 12 }}>↑</span>
              Có {newPostsCount} bài viết mới
            </button>
          </div>
        ) : null}

        {(() => {
          if (filteredItems.length === 0) {
            const emptyMsg =
              activeTab === "following"
                ? "Bạn chưa yêu thích ai, hoặc họ chưa đăng bài nào."
                : activeTab === "friends"
                  ? "Chưa có bạn bè (follow 2 chiều) nào đăng bài."
                  : "Chưa có bài viết nào, đăng bài đầu tiên đi nhé.";

            return <div className="empty-state">{emptyMsg}</div>;
          }

          const surfaceForFeed: "home" | "following" =
            activeTab === "following" ? "following" : "home";
          return filteredItems.map((item, idx) => {
            // Viewport-gated mount: first 3 cards always eager (above-the-fold);
            // rest defer until near the viewport to shrink initial DOM/JS work.
            const rootMargin = idx < 3 ? "1200px 0px" : "600px 0px";
            const inner = item.kind === "post" ? (
              <PostCard
                meId={me?.id}
                post={item.data}
                onRefresh={loadFeed}
                onRemoved={handlePostRemoved}
                onViewProfile={onViewProfile}
                canDelete={me?.id === item.data.user_id}
                compactMedia
                feedSurface={surfaceForFeed}
              />
            ) : (
              <PostCard
                meId={me?.id}
                post={videoRowToPost(item.data)}
                onRefresh={loadVideos}
                onRemoved={handleVideoRemoved}
                onViewProfile={onViewProfile}
                canDelete={me?.id === item.data.user_id}
                compactMedia
                feedSurface={surfaceForFeed}
              />
            );
            return (
              <Fragment key={item.id}>
                {idx < 3 ? inner : (
                  <LazyMount minHeight={420} rootMargin={rootMargin}>{inner}</LazyMount>
                )}
              </Fragment>
            );
          });

        })()}

        {/* Sentinel cho infinite scroll — quan sát bằng IntersectionObserver. */}
        {hasMorePosts ? (
          <InfiniteSentinel onVisible={loadMorePosts} loading={loadingMore} />
        ) : null}

        {/* Nếu danh sách quá ngắn vẫn hiển thị nút Vàng để không mất điểm nhấn. */}
        {/* Fallback Community Connection banner removed per UI cleanup directive. */}

        {posts.length > 0 && !hasMorePosts ? (
          <div className="feed-threads-footer" aria-label="HXFWB signature">
            ✨ Website được tạo bởi team <span>HXFWB</span> ✨
          </div>
        ) : null}
      </section>


      {confirmCandy ? (
        <div className="modal-backdrop" onClick={() => setConfirmCandy(null)}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360 }}
          >
            <div className="modal-header">
              <h3 className="section-title">Xác nhận nhận Coin</h3>
            </div>
            <div className="modal-body stack-md">
              <p>
                Bạn đã nhận được <strong>{confirmCandy.amount.toLocaleString()} Coin</strong> từ{" "}
                <strong>{confirmCandy.senderName}</strong>.
              </p>
              <div className="inline-flex gap-3 justify-end">
                <button
                  className="secondary-cta compact"
                  onClick={() => {
                    onOpenChat?.(confirmCandy.senderId);
                    setConfirmCandy(null);
                  }}
                >
                  <MessageCircle size={16} /> Cảm ơn qua chat
                </button>
                <button className="primary-cta compact" onClick={() => setConfirmCandy(null)}>
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== Admin Composer Modal ===== */}
      {adminComposerOpen && isMeAdmin ? (
        <div className="modal-backdrop" onClick={() => setAdminComposerOpen(false)}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, width: "94vw" }}
          >
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="section-title" style={{ margin: 0 }}>📢 Đăng thông báo</h3>
              <button className="icon-button" onClick={() => setAdminComposerOpen(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-md">
              <input
                className="app-input"
                placeholder="Tiêu đề (vd: Cập nhật phiên bản 2.0)"
                value={adminTitle}
                onChange={(e) => setAdminTitle(e.target.value)}
                maxLength={120}
              />
              <textarea
                className="app-input"
                rows={5}
                placeholder="Nội dung thông báo…"
                value={adminText}
                onChange={(e) => setAdminText(e.target.value)}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.75 }}>Mức độ ưu tiên</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    { k: "urgent", label: "🚨 Khẩn cấp", c: "#ef4444" },
                    { k: "important", label: "📢 Quan trọng", c: "#f97316" },
                    { k: "info", label: "📣 Thông báo", c: "#3b82f6" },
                  ] as { k: AdminPriority; label: string; c: string }[]).map((p) => (
                    <button
                      key={p.k}
                      type="button"
                      onClick={() => setAdminPriority(p.k)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: `1.5px solid ${adminPriority === p.k ? p.c : "hsl(var(--border))"}`,
                        background: adminPriority === p.k ? `${p.c}20` : "transparent",
                        color: adminPriority === p.k ? p.c : "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={adminIsPinned} onChange={(e) => setAdminIsPinned(e.target.checked)} />
                  📌 Ghim đầu tab
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={adminIsPopup} onChange={(e) => setAdminIsPopup(e.target.checked)} />
                  💬 Hiện popup khi mở website
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="secondary-cta compact" onClick={() => setAdminComposerOpen(false)}>Hủy</button>
                <button
                  className="primary-cta compact"
                  onClick={() => void handleAdminSubmit()}
                  disabled={adminPosting}
                >
                  {adminPosting ? "Đang đăng…" : "Đăng thông báo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== Admin Popup on load ===== */}
      {adminPopup ? (
        <div className="modal-backdrop" onClick={closeAdminPopup}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: "94vw" }}
          >
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                📣 Thông báo từ Admin
              </h3>
              <button className="icon-button" onClick={closeAdminPopup} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-md">
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
                {adminPopup.content}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  className="secondary-cta compact"
                  onClick={() => {
                    switchTab("admin");
                    closeAdminPopup();
                  }}
                >
                  Xem tất cả thông báo
                </button>
                <button className="primary-cta compact" onClick={closeAdminPopup}>Đã hiểu</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </>


  );
}

/** Sentinel cho infinite scroll — kích hoạt onVisible khi vào viewport. */
function InfiniteSentinel({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onVisible();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);
  return (
    <div ref={ref} style={{ minHeight: 32, display: "flex", justifyContent: "center", padding: "12px 0" }}>
      {loading ? <span className="muted-copy" style={{ fontSize: 13 }}>Đang tải thêm…</span> : null}
    </div>
  );
}
