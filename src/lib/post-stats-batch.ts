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

export interface PostStats {
  likes: number;
  comments: number;
  views: number;
  gifts: number;
  liked: boolean;
}

const EMPTY: PostStats = { likes: 0, comments: 0, views: 0, gifts: 0, liked: false };
const TTL = 30_000;

type Entry = { at: number; value: PostStats };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<(s: PostStats) => void>>();

let queue = new Map<string, Array<(s: PostStats) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let rpcAvailable: boolean | null = null;

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

  let done = false;

  if (rpcAvailable !== false) {
    const { data, error } = await supabase.rpc("post_stats_batch" as any, {
      p_ids: ids,
      p_viewer: meId,
    } as any);
    if (!error && Array.isArray(data)) {
      rpcAvailable = true;
      for (const row of data as any[]) {
        result.set(String(row.post_id), {
          likes: Number(row.likes) || 0,
          comments: Number(row.comments) || 0,
          views: Number(row.views) || 0,
          gifts: Number(row.gifts) || 0,
          liked: Boolean(row.liked),
        });
      }
      done = true;
    } else {
      rpcAvailable = false;
    }
  }

  if (!done) {
    // Fallback: 4 query cho CẢ batch (thay vì 5 query mỗi bài).
    const [likes, comments, views, gifts] = await Promise.all([
      supabase.from("likes").select("post_id,user_id").in("post_id", ids),
      supabase.from("comments").select("post_id").in("post_id", ids),
      supabase.from("post_views" as any).select("post_id").in("post_id", ids),
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
    if (!timer) timer = setTimeout(() => { void flush(meId ?? null); }, 40);
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

export function invalidatePostStats(postId?: string) {
  if (postId) cache.delete(postId);
  else cache.clear();
}
