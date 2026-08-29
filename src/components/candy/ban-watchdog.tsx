/**
 * BanWatchdog — mount ở tầng gốc (__root.tsx), chạy suốt vòng đời app.
 * Kết hợp Realtime (ban-realtime.ts) + polling ngầm 2s (ban-watchdog.ts).
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { startBanWatchdog, checkBanNow, checkDeviceBanNow } from "@/lib/ban-watchdog";

export function BanWatchdog() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => startBanWatchdog(), []);

  // Đổi route → kiểm tra ẩn ngay lập tức.
  useEffect(() => {
    void checkBanNow();
    void checkDeviceBanNow();
  }, [pathname]);

  return null;
}
