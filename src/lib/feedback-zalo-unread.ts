/**
 * Feedback Zalo — huy hiệu đỏ + nhãn NEW / VIP ZALO.
 *
 * Huy hiệu: luôn hiển thị, giá trị = 1 + số chu kỳ 5 phút đã trôi qua kể từ mốc
 * bắt đầu đã lưu trong localStorage. Giá trị được TÍNH từ mốc (không cộng dồn),
 * nên F5, nhiều tab, mount nhiều lần hay máy ngủ dậy đều cho cùng một kết quả,
 * và không cần truy vấn database.
 *
 * Nhãn: NEW khi bài < 5 ngày tính từ created_at, từ 5 ngày trở lên là VIP ZALO.
 */
import { useEffect, useState } from "react";

export const BADGE_PERIOD_MS = 5 * 60_000;
export const NEW_WINDOW_MS = 5 * 24 * 60 * 60_000;
const START_KEY = "fz_badge_start_v2";

export function badgeCount(startMs: number, nowMs: number): number {
  return 1 + Math.max(0, Math.floor((nowMs - startMs) / BADGE_PERIOD_MS));
}

export type FeedbackLabel = "NEW" | "VIP ZALO";

export function feedbackLabel(createdAt: string, nowMs: number): FeedbackLabel {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return "VIP ZALO";
  return nowMs - t < NEW_WINDOW_MS ? "NEW" : "VIP ZALO";
}

export function getBadgeStart(now = Date.now()): number {
  try {
    const v = Number(localStorage.getItem(START_KEY));
    if (Number.isFinite(v) && v > 0 && v <= now) return v;
    localStorage.setItem(START_KEY, String(now));
  } catch { /* storage bị chặn → dùng mốc hiện tại */ }
  return now;
}

/** Đồng hồ dùng chung: tick đúng ranh giới chu kỳ, và khi tab hiện lại / máy thức dậy. */
export function useNow(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const n = Date.now();
      setNow(n);
      timer = setTimeout(schedule, periodMs - (n % periodMs) + 50);
    };
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", schedule);
    };
  }, [periodMs]);
  return now;
}

/** Số trên huy hiệu đỏ (0 trước khi chạy ở trình duyệt để tránh lệch SSR). */
export function useFeedbackZaloUnread(): number {
  const now = useNow(BADGE_PERIOD_MS);
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => {
    setStart(getBadgeStart());
    const onStorage = (e: StorageEvent) => { if (e.key === START_KEY) setStart(getBadgeStart()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return start === null ? 0 : badgeCount(start, now);
}
