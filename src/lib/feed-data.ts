/**
 * feed-data.ts — data-layer thuần cho Feed.
 *
 * Bước 1 của kế hoạch refactor useInfiniteQuery: tách các truy vấn Supabase
 * ra khỏi component `FeedPage` để (a) test được bằng Playwright + mock, và
 * (b) sau này bọc bằng `useInfiniteQuery` mà không phải sờ vào UI.
 *
 * NGHIÊM NGẶT: mọi hàm ở đây phải là "pure data" — không đụng React state,
 * không setState, không toast, không phụ thuộc `mountedRef`. Chỉ nhận input,
 * gọi supabase, trả về kết quả. Behavior (thứ tự bài, interleave 4:1, pinned,
 * fallback enum/column) PHẢI khớp 1:1 với `feed-page.tsx` gốc để bước tiếp
 * theo swap sang useInfiniteQuery không làm vỡ regression.
 */

import { supabase as defaultClient } from "@/lib/supabase";
import { contentClient } from "@/lib/content-db";
import { cachedQuery, peekCache, setCache } from "@/lib/request-cache";
import { isLockedAccount } from "@/lib/user-name";
import { filterLockedPosts } from "@/lib/locked-accounts";
import { fetchProfilesByIds } from "@/lib/profile-cache";
import {
  snapshotKey,
  readSnapshot,
  writeSnapshot,
  backgroundRefresh,
} from "@/lib/feed-snapshot";
import { orderFeedRows, globalFeedSeed } from "@/lib/feed-order";

export const PAGE_SIZE = 10;

export const POST_COLS =
  "id, user_id, content, image_url, likes_count, comments_count, created_at, image_urls, visibility, status, has_images, virtual_view_base, category, display_view_offset, is_anonymous, bot_likes, is_edited, post_code, pin_until, is_locked, comments_disabled, priority_new, bumped_at, is_pinned, is_hidden, priority_level, pinned_until, locked_at, locked_reason, priority_until, is_featured, featured_until, coin_pool_total, coin_pool_remaining, max_claimers, claimed_count, coin_per_person, reward_enabled, reward_mode, views_count, is_deleted, is_admin_post, admin_priority, is_popup, relationship_type, facebook_url, zalo_url, gif_url, pinned_at, deleted_at, deleted_by, delete_reason";

const PROFILE_FIELDS_BASE =
  "id, display_name, full_name, username, avatar, vip_level, title_gif_url, gender, province, location, intent, is_admin, is_virtual, created_at, identity_crown, identity_pet, identity_flag, is_banned, is_blocked, block_level";

/**
 * `badge_id` chỉ tồn tại sau khi chạy docs/sql/2026-07-30_profile_badge_id.sql
 * trên DB. Probe 1 lần rồi mới thêm vào select để feed không vỡ (PostgREST 400)
 * khi cột chưa được deploy.
 */
export let PROFILE_FIELDS = PROFILE_FIELDS_BASE;

let badgeProbe: Promise<void> | null = null;
export function ensureBadgeColumnProbe(client: SupabaseLike = defaultClient): Promise<void> {
  if (!badgeProbe) {
    badgeProbe = (async () => {
      try {
        const { error } = await (client as any).from("profiles").select("badge_id").limit(1);
        if (!error) PROFILE_FIELDS = `${PROFILE_FIELDS_BASE}, badge_id`;
      } catch { /* giữ nguyên base */ }
    })();
  }
  return badgeProbe;
}

if (typeof window !== "undefined") void ensureBadgeColumnProbe();


// Home chỉ hiển thị bài category='general'. Category 'ons' vẫn được xem là
// legacy của Trang Chủ theo DB cũ; 'important' chỉ nằm ở trang Quan Trọng.
export const GENERAL_FEED_CATEGORIES = ["general", "ons"] as const;
export const LEGACY_GENERAL_FEED_CATEGORIES = ["ons"] as const;


/** Kiểu supabase client tối thiểu để test truyền client mock vào. */
export type SupabaseLike = typeof defaultClient;

export const isEnumCategoryError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "22P02" &&
      "message" in error &&
      String((error as { message?: unknown }).message || "").includes("post_category"),
  );

/** Trả list admin ids để dùng cho interleave 4:1. Cache 5 phút + dedupe. */
export async function fetchAdminIds(client: SupabaseLike = defaultClient): Promise<string[]> {
  return cachedQuery(
    "feed:adminIds",
    async () => {
      const { data } = await client.from("profiles").select("id").eq("is_admin", true);
      return ((data as any[]) || []).map((r) => r.id).filter(Boolean) as string[];
    },
    5 * 60_000,
    { persist: true },
  );
}

interface InterleaveParams {
  offset: number;
  pageSize: number;
  adminIds: string[];
  client?: SupabaseLike;
  /** When set, restrict feed to a single category (e.g. "fwb"). */
  categoryFilter?: string | null;
}


/**
 * Feed "Dành cho bạn": phối 4 bài thành viên + 1 bài admin.
 * Copy nguyên logic từ queryPostsPage() nhánh !isPrivate && me?.id.
 * Trả về `{ rows, error }` — nếu member query lỗi thì error !== null để caller
 * fallback sang `fetchOrderedPage`.
 */
export async function fetchInterleavedPage({
  offset,
  pageSize,
  adminIds,
  client = defaultClient,
  categoryFilter = null,
}: InterleaveParams): Promise<{ rows: any[]; rawCount: number; error: unknown | null }> {
  const memberPerPage = Math.max(1, Math.round(pageSize * 0.8)); // 8/10
  const adminPerPage = Math.max(0, pageSize - memberPerPage); // 2/10
  const page = Math.floor(offset / pageSize);
  const mFrom = page * memberPerPage;
  const mTo = mFrom + memberPerPage - 1;
  const aFrom = page * adminPerPage;
  const aTo = aFrom + Math.max(0, adminPerPage - 1);

  const applyCategory = (qb: any) =>
    categoryFilter
      ? qb.eq("category", categoryFilter)
      : qb.in("category", GENERAL_FEED_CATEGORIES);

  const isImportant = categoryFilter === "important";
  // `neq(true)` loại luôn hàng có is_admin_post = NULL (SQL NULL != true → NULL),
  // khiến trang 2+ hụt hàng và infinite scroll dừng sớm. Dùng or(is null, eq false).
  const applyAdminFlag = (qb: any) =>
    isImportant
      ? qb.eq("is_admin_post", true)
      : qb.or("is_admin_post.is.null,is_admin_post.eq.false");

  const baseMember = applyCategory(
    (contentClient(client).from("posts") as any)
      .select(POST_COLS)
        .is("deleted_at", null)
      .neq("visibility", "feedback")
      .neq("category", "feedback"),
  ).order("created_at", { ascending: false });
  const memberQueryBase = applyAdminFlag(baseMember);
  const memberQuery = adminIds.length
    ? (isImportant
        ? memberQueryBase
        : memberQueryBase.not("user_id", "in", `(${adminIds.join(",")})`))
    : memberQueryBase;


  const adminQueryP =
    adminIds.length && adminPerPage > 0
      ? applyAdminFlag(
          (contentClient(client).from("posts") as any)
          .select(POST_COLS)
        .is("deleted_at", null)
          .neq("visibility", "feedback")
            .neq("category", "feedback"),
        )
          .in("user_id", adminIds)
          .order("created_at", { ascending: false })
          .range(aFrom, aTo)
      : Promise.resolve({ data: [] as any[], error: null });

  const [memRes, admRes] = await Promise.all([memberQuery.range(mFrom, mTo), adminQueryP]);
  if (memRes.error) return { rows: [], rawCount: 0, error: memRes.error };

  const members: any[] = ((memRes.data as any[]) || []).filter(Boolean);
  const admins: any[] = (((admRes as any).data as any[]) || []).filter(Boolean);

  const interleaved: any[] = [];
  let mi = 0;
  let ai = 0;
  while (interleaved.length < pageSize && (mi < members.length || ai < admins.length)) {
    for (let k = 0; k < 4 && mi < members.length && interleaved.length < pageSize; k++) {
      interleaved.push(members[mi++]);
    }
    if (ai < admins.length && interleaved.length < pageSize) {
      interleaved.push(admins[ai++]);
    } else if (mi >= members.length) {
      break;
    }
  }
  while (ai < admins.length && interleaved.length < pageSize) interleaved.push(admins[ai++]);

  // Bài ghim (is_pinned = true) LUÔN nằm trên cùng. Chỉ prepend ở trang đầu.
  // Nhiều bài ghim → sắp xếp theo pinned_at mới nhất, fallback created_at.
  let pinned: any[] = [];
  if (offset === 0 && !isImportant) {
    let pinRes: any = await applyCategory(
      (contentClient(client).from("posts") as any)
        .select(POST_COLS)
        .is("deleted_at", null)
        .neq("visibility", "feedback")
        .neq("category", "feedback")
        .eq("is_pinned", true),
    )
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (pinRes?.error && /pinned_at/.test(pinRes.error.message || "")) {
      pinRes = await applyCategory(
        (contentClient(client).from("posts") as any)
          .select(POST_COLS)
        .is("deleted_at", null)
          .neq("visibility", "feedback")
          .neq("category", "feedback")
          .eq("is_pinned", true),
      )
        .order("created_at", { ascending: false })
        .limit(50);
    }
    if (!(pinRes as any).error) {
      pinned = (((pinRes as any).data as any[]) || []).filter(Boolean);
    }
  }

  const combined = [...pinned, ...interleaved];
  const seen = new Set<string>();
  const rows = combined.filter((p) => {
    if (!p?.id || seen.has(p.id)) return false;
    // Bài chờ Admin duyệt không hiển thị ngoài feed.
    if (p.status === "pending") return false;
    if (p.visibility === "feedback" || p.category === "feedback") return false;
    if (isImportant) {
      if (p.is_admin_post !== true) return false;
    } else {
      if (p.is_admin_post === true) return false;
    }
    seen.add(p.id);
    return true;
  });
  return { rows, rawCount: members.length + admins.length, error: null };
}


interface OrderedParams {
  isPrivate: boolean;
  offset: number;
  pageSize: number;
  client?: SupabaseLike;
  /** When set, restrict feed to a single category. Overrides GENERAL/private defaults. */
  categoryFilter?: string | null;
}

/**
 * Fallback / private-feed path: order theo is_pinned → is_featured → bumped_at
 * → created_at, kèm 3 tầng fallback cột / enum như code cũ.
 */
export async function fetchOrderedPage({
  isPrivate,
  offset,
  pageSize,
  client = defaultClient,
  categoryFilter = null,
}: OrderedParams): Promise<{ rows: any[]; rawCount: number; error: unknown | null }> {
  const rangeFrom = offset;
  const rangeTo = offset + pageSize - 1;

  const applyAdminOrder = (qb: any) =>
    qb
      .order("is_pinned", { ascending: false, nullsFirst: false })
      .order("is_featured", { ascending: false, nullsFirst: false })
      .order("bumped_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

  const applyCat = (qb: any) => {
    if (categoryFilter) return qb.eq("category", categoryFilter);
    if (isPrivate) return qb.eq("category", "private");
    return qb.in("category", GENERAL_FEED_CATEGORIES);
  };

  const isImportant = categoryFilter === "important";
  // `neq(true)` loại luôn hàng có is_admin_post = NULL (SQL NULL != true → NULL),
  // khiến trang 2+ hụt hàng và infinite scroll dừng sớm. Dùng or(is null, eq false).
  const applyAdminFlag = (qb: any) =>
    isImportant
      ? qb.eq("is_admin_post", true)
      : qb.or("is_admin_post.is.null,is_admin_post.eq.false");

  let q = applyAdminFlag(
    applyCat((contentClient(client).from("posts") as any).select(POST_COLS)
        .is("deleted_at", null).neq("visibility", "feedback")),
  );
  let r = await applyAdminOrder(q).range(rangeFrom, rangeTo);

  if (
    r.error &&
    /column .*(is_pinned|is_featured|bumped_at).* does not exist/i.test(r.error.message || "")
  ) {
    const q2 = applyAdminFlag(
      applyCat((contentClient(client).from("posts") as any).select(POST_COLS)
        .is("deleted_at", null).neq("visibility", "feedback")),
    );
    r = await q2.order("created_at", { ascending: false }).range(rangeFrom, rangeTo);
  }
  if (!isPrivate && !categoryFilter && isEnumCategoryError(r.error)) {
    r = await applyAdminOrder(
      applyAdminFlag((contentClient(client).from("posts") as any)
        .select(POST_COLS)
        .is("deleted_at", null)
        .neq("visibility", "feedback")
        .in("category", LEGACY_GENERAL_FEED_CATEGORIES)),
    ).range(rangeFrom, rangeTo);
  }
  if (isPrivate && isEnumCategoryError(r.error)) {
    return { rows: [], rawCount: 0, error: null };
  }
  if (r.error && /column .* does not exist/i.test(r.error.message || "")) {
    r = await applyAdminFlag(
      (contentClient(client).from("posts") as any)
        .select(POST_COLS)
        .is("deleted_at", null)
        .neq("visibility", "feedback")
        .neq("category", "feedback"),
    )
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);
  }

  const safeRows = ((r.data as any[]) || []).filter((p) => {
    if (!p) return false;
    if (p.status === "pending") return false;
    if (p.visibility === "feedback") return false;
    if (p.category === "feedback") return false;
    if (isImportant) {
      if (p.is_admin_post !== true) return false;
    } else {
      if (p.is_admin_post === true) return false;
    }
    return true;
  });
  return { rows: safeRows, rawCount: ((r.data as any[]) || []).length, error: r.error };
}


interface QueryPageParams {
  isPrivate: boolean;
  meId: string | null | undefined;
  offset: number;
  pageSize?: number;
  adminIds?: string[] | null;
  client?: SupabaseLike;
  /** When set, restrict feed to a single category (e.g. "fwb"). */
  categoryFilter?: string | null;
}

/**
 * Tương đương `queryPostsPage(offset, size)` trong feed-page.tsx.
 * - Nếu !isPrivate && có meId → thử interleave 4:1; lỗi thì fallback ordered.
 * - Ngược lại → ordered path.
 * - `adminIds` truyền vào để tránh gọi lại `fetchAdminIds` mỗi trang.
 * - `categoryFilter` (optional) → lọc feed theo đúng 1 category (dành cho
 *   trang chuyên biệt như Tìm FWB / Tìm ONS). Khi có filter, luôn đi ordered
 *   path để tránh phối 4:1 làm loãng feed chuyên biệt.
 */
export async function queryPostsPage({
  isPrivate,
  meId,
  offset,
  pageSize = PAGE_SIZE,
  adminIds,
  client = defaultClient,
  categoryFilter = null,
}: QueryPageParams): Promise<{ rows: any[]; rawCount: number; error: unknown | null }> {
  // Chỉ phối 4:1 khi caller CHỦ ĐỘNG truyền adminIds. Home feed truyền null →
  // đi ordered path, giữ đúng "mới nhất lên trước" và không hụt hàng.
  if (!categoryFilter && !isPrivate && meId && adminIds && adminIds.length > 0) {
    try {
      const res = await fetchInterleavedPage({ offset, pageSize, adminIds, client });
      if (!res.error) return res;
      console.warn("[feed-data] member query failed, fallback ordered:", (res.error as any)?.message);
    } catch (err) {
      console.warn("[feed-data] 4:1 interleave failed, fallback ordered:", err);
    }
  }
  return fetchOrderedPage({ isPrivate, offset, pageSize, client, categoryFilter });
}


/** So sánh 2 bài theo quy tắc GHIM: is_pinned → pinned_at desc → created_at desc. */
export function comparePinnedFirst(a: any, b: any): number {
  const ap = a?.is_pinned === true ? 1 : 0;
  const bp = b?.is_pinned === true ? 1 : 0;
  if (ap !== bp) return bp - ap;
  if (ap === 1) {
    const at = new Date(a?.pinned_at || a?.created_at || 0).getTime();
    const bt = new Date(b?.pinned_at || b?.created_at || 0).getTime();
    if (at !== bt) return bt - at;
  }
  return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
}

/** Lấy TẤT CẢ bài ghim đang còn hiệu lực — luôn hiển thị đầu feed. */
export async function fetchPinnedPosts(
  client: SupabaseLike = defaultClient,
  limit = 50,
): Promise<any[]> {
  const { data } = await (contentClient(client).from("posts") as any)
    .select(POST_COLS)
        .is("deleted_at", null)
    .eq("is_pinned", true)
    .neq("is_admin_post", true)
    .neq("visibility", "feedback")
    .neq("category", "feedback")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (((data as any[]) || []).filter(Boolean)).sort(comparePinnedFirst);
}

/** Lấy 1 bài ghim đang còn hiệu lực — giữ lại cho code cũ. */
export async function fetchPinnedPost(
  client: SupabaseLike = defaultClient,
): Promise<any | null> {
  const rows = await fetchPinnedPosts(client, 1);
  return rows[0] ?? null;
}


/** Bổ sung `profiles` cho batch posts — dùng chung profile-cache toàn app. */
export async function hydrateProfiles(
  rows: any[],
  client: SupabaseLike = defaultClient,
): Promise<any[]> {
  if (rows.length === 0) return rows;
  const profileMap = await fetchProfilesByIds(
    rows.map((p) => p.user_id),
    PROFILE_FIELDS,
    client,
  );
  // Anti Clone: bài viết của tài khoản ĐANG BỊ KHÓA không xuất hiện ở
  // Feed / Hồ sơ / Tìm kiếm (comment & message vẫn giữ nguyên).
  return filterLockedPosts(
    rows
      .map((p) => ({ ...p, profiles: profileMap.get(p.user_id) || null }))
      .filter((p) => !isLockedAccount(p.profiles as any)),
  );
}

/* ============================================================
 * Cursor-based wrapper — chuẩn bị cho useInfiniteQuery ở BƯỚC 3.
 * ============================================================ */

export interface FeedPageCursor {
  offset: number;
}

export interface FetchFeedPageParams {
  isPrivate: boolean;
  meId: string | null | undefined;
  cursor?: FeedPageCursor | null;
  pageSize?: number;
  /** Truyền vào page 0 để chèn bài ghim lên đầu. Các trang sau bỏ qua. */
  includePinned?: boolean;
  blockedIds?: Set<string>;
  followSet?: Set<string>;
  adminIds?: string[] | null;
  client?: SupabaseLike;
  /** When set, restrict feed to a single category (e.g. "fwb"). */
  categoryFilter?: string | null;
}


export interface FetchFeedPageResult {
  rows: any[];
  nextCursor: FeedPageCursor | null;
  /** True nếu server trả đủ pageSize hàng thô (trước khi filter block). */
  hasMore: boolean;
}

/**
 * Load 1 "page" cho useInfiniteQuery.
 * Áp dụng đúng thứ tự xử lý của loadFeed()/loadMorePosts() gốc:
 *  1. queryPostsPage (interleave 4:1 hoặc ordered).
 *  2. Filter block list.
 *  3. Private feed: sort theo followSet trước, rồi created_at.
 *  4. Page 0 + includePinned: prepend bài ghim, dedupe theo id.
 *  5. hydrateProfiles.
 */
export async function fetchFeedPageFresh({
  isPrivate,
  meId,
  cursor,
  pageSize = PAGE_SIZE,
  includePinned = false,
  blockedIds,
  followSet,
  adminIds,
  client = defaultClient,
  categoryFilter = null,
}: FetchFeedPageParams): Promise<FetchFeedPageResult> {
  const offset = cursor?.offset ?? 0;
  const { rows: rawRows, rawCount, error } = await queryPostsPage({
    isPrivate,
    meId,
    offset,
    pageSize,
    adminIds,
    client,
    categoryFilter,
  });
  if (error) throw error;


  let rows = rawRows;
  if (blockedIds && blockedIds.size > 0) {
    rows = rows.filter((p) => !blockedIds.has(p.user_id));
  }
  if (isPrivate && followSet && followSet.size > 0) {
    rows = [...rows].sort((a, b) => {
      const aF = followSet.has(a.user_id) ? 1 : 0;
      const bF = followSet.has(b.user_id) ? 1 : 0;
      if (aF !== bF) return bF - aF;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  if (offset === 0 && includePinned) {
    const pinned = await fetchPinnedPosts(client);
    const usable = pinned.filter((p) => !blockedIds?.size || !blockedIds.has(p.user_id));
    if (usable.length) {
      const pinnedIds = new Set(usable.map((p) => p.id));
      rows = [...usable, ...rows.filter((p) => !pinnedIds.has(p.id))];
    }
  } else {
    // Các trang sau không được chứa bài ghim (đã nằm ở đầu feed).
    rows = rows.filter((p) => p?.is_pinned !== true);
  }


  const hydrated = await hydrateProfiles(rows, client);

  // Ưu tiên bài "Tài khoản thứ hai" + xáo trộn theo GLOBAL SEED (mọi user
  // thấy chung 1 thứ tự trong cùng cửa sổ 5 phút → tối đa hoá server cache).
  // Bài ghim luôn giữ nguyên vị trí trên cùng.
  const pinnedTop = hydrated.filter((p) => p?.is_pinned === true);
  const rest = hydrated.filter((p) => p?.is_pinned !== true);
  const ordered = [...pinnedTop, ...orderFeedRows(rest)];

  // hasMore phải dựa trên SỐ HÀNG THÔ server trả về, không phải số hàng còn lại
  // sau khi lọc (block list, bài admin, bài ghim) — nếu không feed sẽ dừng sớm.
  const hasMore = rawCount >= pageSize;
  return {
    rows: ordered,
    hasMore,
    nextCursor: hasMore ? { offset: offset + pageSize } : null,
  };
}

/* ============================================================
 * Feed cache (giảm Egress): trang đầu được cache ở localStorage.
 *  - Quay lại Trang chủ / F5 trong 90s → trả cache NGAY (0 request).
 *  - Sau đó đồng bộ nền để snapshot luôn mới cho lượt sau.
 *  - Các trang sau (infinite scroll) luôn gọi thật, không cache.
 * ============================================================ */

export async function fetchFeedPage(
  params: FetchFeedPageParams,
): Promise<FetchFeedPageResult> {
  const offset = params.cursor?.offset ?? 0;
  if (offset !== 0) return fetchFeedPageFresh(params);

  const key = snapshotKey([
    "feed",
    params.isPrivate ? "private" : "general",
    params.meId ?? "anon",
    params.categoryFilter ?? "all",
    params.pageSize ?? PAGE_SIZE,
    params.includePinned ? "pin" : "nopin",
    // Seed chung → snapshot xoay vòng đúng theo cửa sổ thứ tự toàn cục.
    `seed${globalFeedSeed()}`,
  ]);

  const cached = readSnapshot<FetchFeedPageResult>(key);
  if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
    backgroundRefresh(key, () => fetchFeedPageFresh(params));
    // Snapshot có thể được ghi TRƯỚC khi tài khoản bị khóa → phải lọc lại khi
    // đọc, nếu không bài của tài khoản vừa khóa vẫn hiện tới 90s.
    return { ...cached, rows: filterLockedPosts(cached.rows) };
  }

  const fresh = await fetchFeedPageFresh(params);
  if (fresh.rows.length > 0) writeSnapshot(key, fresh);
  return fresh;
}
