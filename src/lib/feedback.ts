/**
 * MODULE FEEDBACK — logic dữ liệu + buff tim/view.
 *
 * Đồng bộ 100% với bảng `feedback_posts` (SB1) schema mới:
 *   id, title, author_name, location, short_content, content, image_url,
 *   target_likes, likes_duration, target_views, views_duration,
 *   rating, is_hidden, created_at, updated_at
 *
 * Nguyên tắc hiệu năng (bắt buộc):
 *  - KHÔNG realtime, KHÔNG channel, KHÔNG polling mỗi giây.
 *  - Tim/View KHÔNG lưu từng lượt: chỉ lưu target + duration, giá trị hiện tại
 *    được TÍNH TẠI CLIENT từ created_at → 0 request.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";

export interface FeedbackPost {
  id: string;
  title: string;
  author_name: string;
  location: string;
  short_content: string;
  content: string;
  image_url: string | null;
  target_likes: number;
  likes_duration: number;
  target_views: number;
  views_duration: number;
  rating: number;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export const FEEDBACK_COLUMNS =
  "id,title,author_name,location,short_content,content,image_url,target_likes,likes_duration,target_views,views_duration,rating,is_hidden,created_at,updated_at";

/** Cache 5 phút — mọi màn hình dùng chung, back lại KHÔNG refetch. */
export const FEEDBACK_STALE_MS = 5 * 60_000;

export const DURATION_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "2 ngày", seconds: 2 * 86400 },
  { label: "1 tuần", seconds: 7 * 86400 },
  { label: "1 tháng", seconds: 30 * 86400 },
];

export const RATING_PRESETS = [3.8, 4.2, 4.8, 5.0];

/* ------------------------------------------------------------------ */
/* Buff: giá trị hiện tại tính thuần bằng toán học từ mốc thời gian.   */
/* ------------------------------------------------------------------ */

/** Hash ổn định → jitter nhỏ để số nhảy trông "tự nhiên", không random loạn. */
function stableNoise(seed: string, bucket: number): number {
  let h = 2166136261;
  const s = `${seed}:${bucket}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

/** Đường cong tăng nhanh lúc đầu rồi chậm dần (ease-out). */
export function buffValue(
  target: number,
  startISO: string,
  seconds: number,
  seed = "",
): number {
  const goal = Math.max(0, Number(target) || 0);
  const t0 = new Date(startISO).getTime();
  if (!Number.isFinite(t0) || goal <= 0) return goal;
  const total = Math.max(60, Number(seconds) || 0) * 1000;
  const p = Math.min(1, Math.max(0, (Date.now() - t0) / total));
  if (p >= 1) return goal;
  const eased = 1 - Math.pow(1 - p, 1.9);
  const raw = goal * eased;
  const bucket = Math.floor(Date.now() / 30_000);
  const jitter = (stableNoise(seed, bucket) - 0.5) * 0.008 * goal * (1 - p);
  return Math.max(0, Math.min(goal, Math.round(raw + jitter)));
}

export function likeCountOf(p: FeedbackPost): number {
  return buffValue(p.target_likes, p.created_at, p.likes_duration, `${p.id}:l`);
}
export function viewCountOf(p: FeedbackPost): number {
  return buffValue(p.target_views, p.created_at, p.views_duration, `${p.id}:v`);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** Tick nhẹ 30s/lần chỉ để vẽ lại số buff (không hề gọi mạng). */
export function useBuffTick(intervalMs = 30_000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

/** Số bài tối đa tải về 1 lần. */
export const FEEDBACK_MAX_ROWS = 500;

function sortByNewest(rows: FeedbackPost[]): FeedbackPost[] {
  const map = new Map<string, FeedbackPost>();
  for (const r of rows) if (r && r.id && !map.has(r.id)) map.set(r.id, r);
  return [...map.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Client: toàn bộ feedback đang hiển thị (is_hidden = false). */
export async function fetchFeedbackPublished(): Promise<FeedbackPost[]> {
  const { data, error } = await (supabase.from("feedback_posts") as any)
    .select(FEEDBACK_COLUMNS)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(0, FEEDBACK_MAX_ROWS - 1);
  if (error) throw error;
  return sortByNewest((data || []) as FeedbackPost[]);
}

/** Admin: lấy cả bài đang ẩn. */
export async function fetchFeedbackAll(): Promise<FeedbackPost[]> {
  const { data, error } = await (supabase.from("feedback_posts") as any)
    .select(FEEDBACK_COLUMNS)
    .order("created_at", { ascending: false })
    .range(0, FEEDBACK_MAX_ROWS - 1);
  if (error) throw error;
  return sortByNewest((data || []) as FeedbackPost[]);
}

/** Mốc thời gian bài mới nhất. */
export async function fetchLatestFeedbackAt(): Promise<string | null> {
  const { data } = await (supabase.from("feedback_posts") as any)
    .select("created_at")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(0, 9);
  const rows = (data || []) as Array<{ created_at: string }>;
  return rows[0]?.created_at || null;
}

/* ------------------------------------------------------------------ */
/* Badge "có Feedback mới"                                             */
/* ------------------------------------------------------------------ */

const SEEN_KEY = "feedback_seen_at";

function seenKey(userId?: string | null) {
  return userId ? `${SEEN_KEY}:${userId}` : SEEN_KEY;
}

export function markFeedbackSeen(latestISO?: string | null, userId?: string | null) {
  try {
    localStorage.setItem(seenKey(userId), latestISO || new Date().toISOString());
    window.dispatchEvent(new CustomEvent("feedback:seen"));
  } catch {
    /* ignore */
  }
}

function getSeen(userId?: string | null): number {
  try {
    return new Date(localStorage.getItem(seenKey(userId)) || 0).getTime() || 0;
  } catch {
    return 0;
  }
}

/** Số bài mới chưa xem (1 query siêu nhẹ: chỉ đếm, không tải dữ liệu). */
export async function countFeedbackSince(sinceISO: string): Promise<number> {
  const { count } = await (supabase.from("feedback_posts") as any)
    .select("id", { count: "exact", head: true })
    .eq("is_hidden", false)
    .gt("created_at", sinceISO);
  return count || 0;
}

export function useFeedbackBadge(userId?: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const check = async () => {
      let latest: string | null = null;
      try {
        latest = await fetchLatestFeedbackAt();
      } catch {
        return;
      }
      if (!alive) return;
      const t = latest ? new Date(latest).getTime() : 0;
      const seen = getSeen(userId);
      if (!(t > seen)) {
        setCount(0);
        return;
      }
      if (!seen) {
        setCount(1);
        return;
      }
      try {
        const n = await countFeedbackSince(new Date(seen).toISOString());
        if (alive) setCount(n || 1);
      } catch {
        if (alive) setCount(1);
      }
    };

    void check();
    const id = window.setInterval(check, FEEDBACK_STALE_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onSeen = () => setCount(0);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("feedback:seen", onSeen as EventListener);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("feedback:seen", onSeen as EventListener);
    };
  }, [userId]);

  return count;
}
