/**
 * post-stats-batch — gom số liệu (likes / comments / views / gifts / liked)
 * của NHIỀU bài viết vào 1 lượt truy vấn duy nhất.
 *
 * Trước:  mỗi <PostCard> tự chạy 5 query khi mount  → 20 bài = 100 request.
 * Sau:    tất cả bài mount trong cùng 1 khung 40ms  → 1 RPC (hoặc 4 query).
 *
 * - Có cache TTL 30s (dedupe request trùng khi cuộn lên/xuống).
 * - Không dùng realtime; cập nhật cục bộ qua `patchPostStats`.
 * - KHÔNG đổi schema: RPC `post_stats_batch` là tuỳ chọn, thiếu thì fallback.
 */
import { supabase } from "@/lib/supabase";
import { db3 } from "@/lib/db/router";

import { read3 } from "@/lib/content-db";
export interface PostStats {
  likes: number;
  comments: number;
  views: number;
  gifts: number;
  liked: boolean;
}

const EMPTY: PostStats = { likes: 0, comments: 0, views: 0, gifts: 0, liked: false };
const TTL = 30_000;
/** Cửa sổ gom batch: đủ rộng để các card mount dần khi cuộn vẫn chung 1 query. */
const BATCH_WINDOW = 250;

type Entry = { at: number; value: PostStats };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<(s: PostStats) => void>>();

let queue = new Map<string, Array<(s: PostStats) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit(id: string, value: PostStats) {
  cache.set(id, { at: Date.now(), value });
  listeners.get(id)?.forEach((fn) => fn(value));
}

function fresh(id: string): PostStats | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL) return null;
  return hit.value;
}

async function flush(meId: string | null) {
  const batch = queue;
  queue = new Map();
  timer = null;
  const ids = [...batch.keys()];
  if (!ids.length) return;

  const result = new Map<string, PostStats>();
  ids.forEach((id) => result.set(id, { ...EMPTY }));

  const bump = (id: string, key: keyof PostStats, by: number) => {
    const row = result.get(id);
    if (!row) return;
    (row[key] as number) = (row[key] as number) + by;
  };

  // RPC `post_stats_batch` trên Supabase #1 đã được loại bỏ hoàn toàn:
  // nó còn tham chiếu bảng log cũ (post_views) nên luôn lỗi. Lượt xem giờ
  // đọc trực tiếp từ Supabase #3 qua db3().
  {
    // 3 query trên Supabase #1 (likes / comments / gifts) + 1 query views trên #3.
    const [likes, comments, views, gifts] = await Promise.all([
      read3().from("likes").select("post_id,user_id").in("post_id", ids),
      read3().from("comments").select("post_id").in("post_id", ids),
      // post_views nằm 100% trên Supabase #3.
      (db3() as any).from("post_views").select("post_id").in("post_id", ids),
      supabase.from("post_gifts" as any).select("post_id,amount").in("post_id", ids),
    ]);
    for (const r of (likes.data as any[]) || []) {
      bump(String(r.post_id), "likes", 1);
      if (meId && r.user_id === meId) {
        const row = result.get(String(r.post_id));
        if (row) row.liked = true;
      }
    }
    for (const r of (comments.data as any[]) || []) bump(String(r.post_id), "comments", 1);
    for (const r of (views.data as any[]) || []) bump(String(r.post_id), "views", 1);
    for (const r of (gifts.data as any[]) || []) bump(String(r.post_id), "gifts", Number(r.amount) || 0);
  }


  for (const [id, resolvers] of batch) {
    const value = result.get(id) ?? { ...EMPTY };
    emit(id, value);
    resolvers.forEach((fn) => fn(value));
  }
}

/** Lấy số liệu 1 bài (được gom chung với các bài khác trong 40ms). */
export function requestPostStats(
  postId: string,
  meId: string | null | undefined,
  cb: (s: PostStats) => void,
): () => void {
  let alive = true;
  const wrapped = (s: PostStats) => { if (alive) cb(s); };

  const cached = fresh(postId);
  if (cached) wrapped(cached);

  let set = listeners.get(postId);
  if (!set) { set = new Set(); listeners.set(postId, set); }
  set.add(wrapped);

  if (!cached) {
    const arr = queue.get(postId) ?? [];
    arr.push(wrapped);
    queue.set(postId, arr);
    if (!timer) timer = setTimeout(() => { void flush(meId ?? null); }, BATCH_WINDOW);
  }

  return () => {
    alive = false;
    set?.delete(wrapped);
    if (set && set.size === 0) listeners.delete(postId);
  };
}

/** Cập nhật cục bộ sau hành động của chính user (không cần query lại). */
export function patchPostStats(postId: string, patch: Partial<PostStats>) {
  const current = cache.get(postId)?.value ?? { ...EMPTY };
  emit(postId, { ...current, ...patch });
}

/** Cộng/trừ 1 chỉ số của bài viết trong cache dùng chung (Feed + Profile). */
export function bumpPostStats(postId: string, key: "likes" | "comments" | "views" | "gifts", by: number) {
  if (!postId || !by) return;
  const current = cache.get(postId)?.value ?? { ...EMPTY };
  emit(postId, { ...current, [key]: Math.max(0, (current[key] as number) + by) });
}

/** Đọc lại số liệu thật từ DB cho 1 bài (bỏ cache) rồi phát cho mọi listener. */
export async function refreshPostStats(postId: string, meId: string | null | undefined) {
  if (!postId) return;
  cache.delete(postId);
  queue.set(postId, queue.get(postId) ?? []);
  if (timer) { clearTimeout(timer); timer = null; }
  await flush(meId ?? null);
}

/**
 * ĐỒNG BỘ TOÀN CỤC: mọi hành động (comment / gift / view / xóa bài) đều phát
 * event trên window; cache dùng chung được cập nhật một lần duy nhất nên Feed
 * và Profile luôn hiển thị CÙNG một con số, không cần F5.
 */
if (typeof window !== "undefined" && !(window as any).__postStatsSyncBound) {
  (window as any).__postStatsSyncBound = true;
  const idOf = (e: Event) => String(((e as CustomEvent).detail as any)?.postId ?? "");
  window.addEventListener("post:comment-added", (e) => bumpPostStats(idOf(e), "comments", 1));
  window.addEventListener("post:comment-removed", (e) => bumpPostStats(idOf(e), "comments", -1));
  window.addEventListener("post:view-counted", (e) => bumpPostStats(idOf(e), "views", 1));
  window.addEventListener("post-gift:sent", (e) => {
    const d = (e as CustomEvent).detail as any;
    bumpPostStats(String(d?.postId ?? ""), "gifts", Number(d?.amount) || 0);
  });
  window.addEventListener("post:removed", (e) => invalidatePostStats(idOf(e) || undefined));
}

export function invalidatePostStats(postId?: string) {
  if (postId) cache.delete(postId);
  else cache.clear();
}


/**
 * Nạp sẵn số liệu cho CẢ trang posts vừa fetch (1 lượt query duy nhất).
 * Nhờ vậy các <PostCard> mount dần khi cuộn chỉ đọc cache — không phát request.
 */
export async function prefetchPostStats(postIds: string[], meId: string | null | undefined) {
  const ids = postIds.filter((id) => id && !fresh(id));
  if (!ids.length) return;
  ids.forEach((id) => { if (!queue.has(id)) queue.set(id, []); });
  if (timer) { clearTimeout(timer); timer = null; }
  await flush(meId ?? null);
}
