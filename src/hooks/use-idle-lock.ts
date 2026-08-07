import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "candy.lastActivity";
const LOCK_AFTER_MS = 2 * 60 * 60 * 1000; // 2 giờ
const THROTTLE_MS = 15_000;

function now() {
  return Date.now();
}

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : now();
  } catch {
    return now();
  }
}

function writeLastActivity(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // ignore
  }
}

/**
 * Theo dõi hoạt động của người dùng (chuột/bàn phím/cuộn) và tự động
 * "khoá" (locked = true) sau 2 giờ không hoạt động — kể cả khi tab bị
 * đóng rồi mở lại hoặc quay lại app sau một thời gian dài.
 */
export function useIdleLock() {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return now() - readLastActivity() > LOCK_AFTER_MS;
  });
  const lastThrottleRef = useRef(0);

  const bump = useCallback(() => {
    const t = now();
    if (t - lastThrottleRef.current < THROTTLE_MS) return;
    lastThrottleRef.current = t;
    writeLastActivity(t);
  }, []);

  const checkLock = useCallback(() => {
    const last = readLastActivity();
    setLocked(now() - last > LOCK_AFTER_MS);
  }, []);

  useEffect(() => {
    checkLock();
    const onActivity = () => {
      bump();
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", onActivity, opts);
    window.addEventListener("keydown", onActivity, opts);
    window.addEventListener("scroll", onActivity, opts);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkLock);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkLock);
    };
  }, [bump, checkLock]);

  const unlock = useCallback(() => {
    writeLastActivity(now());
    lastThrottleRef.current = now();
    setLocked(false);
  }, []);

  return { locked, unlock };
}
