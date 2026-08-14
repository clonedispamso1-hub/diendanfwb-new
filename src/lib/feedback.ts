/**
 * MODULE FEEDBACK — logic dữ liệu + buff tim/view.
 *
 * Nguyên tắc hiệu năng (bắt buộc):
 *  - KHÔNG realtime, KHÔNG channel, KHÔNG polling mỗi giây.
 *  - Chỉ 1 query danh sách (pagination) + cache 5 phút (react-query).
 *  - Tim/View KHÔNG lưu từng lượt: chỉ lưu base/target/start/seconds,
 *    giá trị hiện tại được TÍNH TẠI CLIENT từ thời gian → 0 request.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FeedbackPost {
  id: string;
  title: string;
  author_name: string;
  area: string;
  excerpt: string;
  content: string;
  image_url: string | null;
  thumb_url: string | null;
  like_base: number;
  like_target: number;
  like_start: string;
  like_seconds: number;
  view_base: number;
  view_target: number;
  view_start: string;
  view_seconds: number;
  rating: number;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  published_at: string;
}

export const FEEDBACK_COLUMNS =
  "id,title,author_name,area,excerpt,content,image_url,thumb_url,like_base,like_target,like_start,like_seconds,view_base,view_target,view_start,view_seconds,rating,is_hidden,created_at,updated_at,published_at";

export const FEEDBACK_PAGE_SIZE = 8;
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

/**
 * Đường cong tăng nhanh lúc đầu rồi chậm dần (ease-out) —
 * ví dụ target 1.000 / 2 ngày: 0 → 20 → 38 → 51 → ... → 1000.
 */
export function buffValue(
  base: number,
  target: number,
  startISO: string,
  seconds: number,
  seed = "",
): number {
  const t0 = new Date(startISO).getTime();
  if (!Number.isFinite(t0) || target <= base) return Math.max(0, base | 0);
  const total = Math.max(60, seconds) * 1000;
  const p = Math.min(1, Math.max(0, (Date.now() - t0) / total));
  if (p >= 1) return target;
  const eased = 1 - Math.pow(1 - p, 1.9);
  const raw = base + (target - base) * eased;
  // jitter ±0.4% đổi mỗi 30 giây (vẫn là hàm thuần của thời gian)
  const bucket = Math.floor(Date.now() / 30_000);
  const jitter = (stableNoise(seed, bucket) - 0.5) * 0.008 * (target - base) * (1 - p);
  return Math.max(base, Math.min(target, Math.round(raw + jitter)));
}

export function likeCountOf(p: FeedbackPost): number {
  return buffValue(p.like_base, p.like_target, p.like_start, p.like_seconds, `${p.id}:l`);
}
export function viewCountOf(p: FeedbackPost): number {
  return buffValue(p.view_base, p.view_target, p.view_start, p.view_seconds, `${p.id}:v`);
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

/** Số bài tối đa tải về 1 lần (đủ lớn để không bao giờ cắt mất bài). */
export const FEEDBACK_MAX_ROWS = 500;

function dedupeById(rows: FeedbackPost[]): FeedbackPost[] {
  const map = new Map<string, FeedbackPost>();
  for (const r of rows) if (r && r.id && !map.has(r.id)) map.set(r.id, r);
  return [...map.values()].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  );
}

/**
 * Lấy TOÀN BỘ feedback đã publish (is_hidden = false), sắp xếp published_at DESC.
 * KHÔNG single/maybeSingle, KHÔNG limit(1), KHÔNG range(0,0).
 */
export async function fetchFeedbackPublished(): Promise<FeedbackPost[]> {
  const { data, error } = await (supabase.from("feedback_posts") as any)
    .select(FEEDBACK_COLUMNS)
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .range(0, FEEDBACK_MAX_ROWS - 1);
  if (error) throw error;
  return dedupeById(((data || []) as FeedbackPost[]).slice());
}

/** @deprecated giữ tương thích — trả về toàn bộ bài đã publish. */
export async function fetchFeedbackPage(_page = 0): Promise<FeedbackPost[]> {
  return fetchFeedbackPublished();
}

/** Admin: lấy cả bài đang ẩn. */
export async function fetchFeedbackAll(): Promise<FeedbackPost[]> {
  const { data, error } = await (supabase.from("feedback_posts") as any)
    .select(FEEDBACK_COLUMNS)
    .order("published_at", { ascending: false })
    .range(0, FEEDBACK_MAX_ROWS - 1);
  if (error) throw error;
  return dedupeById(((data || []) as FeedbackPost[]).slice());
}

/** Mốc thời gian bài mới nhất (không dùng limit(1)/maybeSingle). */
export async function fetchLatestFeedbackAt(): Promise<string | null> {
  const { data } = await (supabase.from("feedback_posts") as any)
    .select("published_at")
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .range(0, 9);
  const rows = (data || []) as Array<{ published_at: string }>;
  return rows[0]?.published_at || null;
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

/**
 * Badge đỏ khi Admin đăng bài mới.
 * Chi phí: 1 query siêu nhẹ khi mở app, khi quay lại tab, và mỗi 5 phút.
 * Không realtime, không channel, không polling giây.
 */
/** Số bài mới chưa xem (1 query siêu nhẹ: chỉ đếm, không tải dữ liệu). */
export async function countFeedbackSince(sinceISO: string): Promise<number> {
  const { count } = await (supabase.from("feedback_posts") as any)
    .select("id", { count: "exact", head: true })
    .eq("is_hidden", false)
    .gt("published_at", sinceISO);
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
