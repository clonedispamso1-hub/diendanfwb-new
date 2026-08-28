/**
 * FwbFeedPage — "💕 Tìm FWB" as a matching board (V3).
 *
 * Independent from Home feed: shows ONLY posts where `category='fwb'`.
 * Composer flow:
 *   1) Tap a relationship sticker.
 *   2) Pick province → district (icon cards, no dropdown).
 *   3) Write a short caption. No images/videos.
 *
 * Reusable: pass a different `categoryId` (ONS / DATING …) and everything
 * else — sticker grid, province picker, feed filter — plugs in for free.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, MapPin, Sparkles } from "lucide-react";
import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { BottomSheet } from "@/components/candy/bottom-sheet";
import { LazyMount } from "@/components/candy/lazy-mount";
import { FeedHeader, type PrimaryTab } from "@/components/candy/feed-header";
import { RelationshipStickerGrid } from "@/components/candy/relationship-sticker-grid";
import { LocationPicker } from "@/components/candy/location-picker";
import { createPostCompat } from "@/lib/db-compat";
import type { PostRecord } from "@/lib/app-types";
import { subscribeFeedRealtime } from "@/lib/feed-realtime";
import {
  PAGE_SIZE,
  fetchFeedPage as fetchFeedPagePure,
  type FetchFeedPageResult,
  type FeedPageCursor,
} from "@/lib/feed-data";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { getFriendlyName, getGreetingPrompt } from "@/lib/name-format";
import {
  getCategoryConfig,
  getRelationshipTag,
  type PostCategoryId,
} from "@/lib/post-categories";

interface Props {
  categoryId?: PostCategoryId;
  onViewProfile: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  onOpenPost?: (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
  primary?: PrimaryTab;
  onPrimaryChange?: (tab: PrimaryTab) => void;
}

export function FwbFeedPage({
  categoryId = "FWB",
  onViewProfile,
  onOpenPost,
  onOpenNotifications,
  unreadCount,
  primary = "admin",
  onPrimaryChange,
}: Props) {
  const { me } = useAuth();
  const meAny = me as any;
  const queryClient = useQueryClient();
  const category = getCategoryConfig(categoryId);

  const [composerOpen, setComposerOpen] = useState(false);
  const [postText, setPostText] = useState("");
  const [relationshipTag, setRelationshipTag] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const queryKey = useMemo(
    () => ["feed", "category", category.dbValue, me?.id ?? "anon"] as const,
    [category.dbValue, me?.id],
  );

  const infinite = useInfiniteQuery<
    FetchFeedPageResult,
    Error,
    InfiniteData<FetchFeedPageResult, FeedPageCursor | null>,
    typeof queryKey,
    FeedPageCursor | null
  >({
    queryKey,
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      fetchFeedPagePure({
        isPrivate: false,
        meId: me?.id ?? null,
        cursor: pageParam ?? null,
        pageSize: PAGE_SIZE,
        includePinned: false,
        categoryFilter: category.dbValue,
      }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });

  const posts: PostRecord[] = useMemo(
    () => (infinite.data?.pages.flatMap((p) => p.rows) ?? []) as PostRecord[],
    [infinite.data],
  );

  useEffect(() => {
    const off = subscribeFeedRealtime({
      onPostInsert: (row) => {
        if (!row) return;
        if ((row as any).category !== category.dbValue) return;
        void queryClient.invalidateQueries({ queryKey });
      },
      onPostUpdate: () => void queryClient.invalidateQueries({ queryKey }),
      onPostDelete: () => void queryClient.invalidateQueries({ queryKey }),
    });
    return off;
  }, [queryClient, queryKey, category.dbValue]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && infinite.hasNextPage && !infinite.isFetchingNextPage) {
            void infinite.fetchNextPage();
          }
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [infinite]);

  const resetComposer = () => {
    setPostText("");
    setRelationshipTag(null);
    setProvince(null);
    setDistrict(null);
  };

  const handleSubmit = useCallback(async () => {
    if (!me) return toast.error("Bạn cần đăng nhập trước.");
    if (!relationshipTag) return toast.error("Hãy chọn một nhãn mối quan hệ.");
    if (!province) return toast.error("Hãy chọn tỉnh / thành phố.");
    if (!district) return toast.error("Hãy chọn quận / huyện.");
    const text = postText.trim();
    if (!text) return toast.error("Viết một dòng giới thiệu ngắn nhé.");

    setPosting(true);
    try {
      await createPostCompat(me.id, text, null, {
        imageUrls: null,
        visibility: "home",
        status: "published",
        category: (category.dbValue === "general"
          ? "fwb"
          : (category.dbValue as any)) as any,
        isAnonymous: false,
        relationshipType: relationshipTag,
        province,
        district,
      });
      toast.success("Đã đăng thành công");
      resetComposer();
      setComposerOpen(false);
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      {
        const { handleRestrictionError } = await import("@/lib/restriction-guard");
        if (await handleRestrictionError(err)) return;
      }
      toast.error(toUserMessage(err, "Không đăng được bài, vui lòng thử lại."));
    } finally {
      setPosting(false);
    }
  }, [me, postText, relationshipTag, province, district, category.dbValue, queryClient, queryKey]);

  const selectedTag = getRelationshipTag(categoryId, relationshipTag);
  const canPost = !!relationshipTag && !!province && !!district && postText.trim().length > 0;

  return (
    <>
      <FeedHeader
        primary={primary}
        onPrimaryChange={(t) => onPrimaryChange?.(t)}
        onNotifications={() => onOpenNotifications?.()}
        notificationCount={unreadCount}
      />

      <div className="fwb-board">
        {/* Hero intro — makes it feel like a matching board, not a feed. */}
        <div className="fwb-board__intro">
          <h2>{category.emoji} Bảng ghép đôi {category.label}</h2>
          <p>
            Chọn nhãn, chọn khu vực rồi để lại một dòng giới thiệu ngắn.
            Bạn sẽ xuất hiện trên bảng cho những người ở gần.
          </p>
        </div>

        {/* Composer trigger — opens the sticker + location bottom sheet. */}
        <div className="composer-trigger-wrap">
          <button
            type="button"
            className="composer-trigger"
            onClick={() => setComposerOpen(true)}
            aria-label={`Đăng bài ghép đôi ${category.label}`}
          >
            <img loading="lazy" decoding="async"
              src={getValidAvatarUrl(meAny?.avatar)}
              onError={handleAvatarError}
              alt=""
              className="composer-trigger__avatar"
            />
            <span className="composer-trigger__field">
              <span className="composer-trigger__text">
                <Sparkles size={14} style={{ marginRight: 6, display: "inline" }} />
                Đăng lên bảng ghép đôi
              </span>
            </span>
            <span className="composer-trigger__cta">Đăng</span>
          </button>
        </div>
      </div>

      <BottomSheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={`${category.emoji} Đăng ${category.label}`}
        leftAction={
          <button type="button" className="bsheet-cancel" onClick={() => setComposerOpen(false)}>
            Hủy
          </button>
        }
        rightAction={
          <button
            type="button"
            className="composer-submit-premium"
            onClick={() => void handleSubmit()}
            disabled={posting || !canPost}
            style={{ height: 34, padding: "0 14px", fontSize: 13, opacity: canPost ? 1 : 0.55 }}
          >
            <Send size={13} strokeWidth={2.4} />
            <span>{posting ? "Đang đăng..." : "Đăng"}</span>
          </button>
        }
      >
        <section
          className="composer-card composer-threads stack-sm rounded-3xl"
          style={{ border: 0, background: "transparent", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div className="flex items-center gap-3">
            <img loading="lazy" decoding="async"
              src={getValidAvatarUrl(meAny?.avatar)}
              onError={handleAvatarError}
              alt={getFriendlyName(meAny?.full_name, meAny?.username)}
              className="rounded-full"
              style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {getGreetingPrompt(meAny?.full_name, meAny?.username)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{category.hint}</div>
            </div>
          </div>

          <div>
            <div className="fwb-board__section-title" style={{ margin: "0 0 8px" }}>
              1 · Chọn nhãn mối quan hệ
            </div>
            <RelationshipStickerGrid
              category={categoryId}
              value={relationshipTag}
              onChange={setRelationshipTag}
            />
          </div>

          <div>
            <div className="fwb-board__section-title" style={{ margin: "0 0 8px" }}>
              2 · Chọn khu vực
            </div>
            <LocationPicker
              province={province}
              district={district}
              onChange={({ province: p, district: d }) => {
                setProvince(p);
                setDistrict(d);
              }}
            />
          </div>

          <div>
            <div className="fwb-board__section-title" style={{ margin: "0 0 8px" }}>
              3 · Giới thiệu ngắn
            </div>
            <textarea
              className="app-input"
              placeholder="Vài dòng về bạn — sở thích, mong muốn…"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              rows={4}
              style={{ resize: "vertical", minHeight: 100 }}
              maxLength={280}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginTop: 4 }}>
              <span>
                {selectedTag ? `Nhãn: ${selectedTag.emoji} ${selectedTag.label}` : "Chưa chọn nhãn"}
                {province ? ` · 📍 ${province}${district ? ` · ${district}` : ""}` : ""}
              </span>
              <span>{postText.length}/280</span>
            </div>
          </div>
        </section>
      </BottomSheet>

      {/* Board feed — same PostCard, filtered to this category only. */}
      <div className="fwb-board__section-title">
        <MapPin size={12} style={{ display: "inline", marginRight: 4 }} />
        Bảng thành viên đang tìm kết nối
      </div>

      {posts.length === 0 && !infinite.isLoading ? (
        <div className="empty-state">
          Chưa có ai đăng {category.label}. Hãy là người đầu tiên!
        </div>
      ) : (
        posts.map((p, idx) => {
          const rootMargin = idx < 3 ? "1200px 0px" : "600px 0px";
          const card = (
            <PostCard
              meId={me?.id}
              post={p}
              onRefresh={() => void infinite.refetch()}
              onRemoved={() => void queryClient.invalidateQueries({ queryKey })}
              onViewProfile={onViewProfile}
              canDelete={me?.id === p.user_id}
              compactMedia
              feedSurface="home"
            />
          );
          return (
            <Fragment key={p.id}>
              {idx < 3 ? card : (
                <LazyMount minHeight={420} rootMargin={rootMargin}>{card}</LazyMount>
              )}
            </Fragment>
          );
        })
      )}

      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      {infinite.isFetchingNextPage ? (
        <div className="empty-state" style={{ opacity: 0.7 }}>Đang tải…</div>
      ) : null}

      <span hidden aria-hidden data-open-post={onOpenPost ? "1" : "0"} />
    </>
  );
}
