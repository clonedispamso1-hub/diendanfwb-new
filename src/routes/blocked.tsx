import { createFileRoute } from "@tanstack/react-router";
import { visibleInterval } from "@/lib/page-visibility";
import { useEffect } from "react";
import { BlockedScreen } from "@/components/candy/blocked-screen";
import {
  securityGate,
  invalidateGateCache,
  clearDeviceBlockedSticky,
} from "@/lib/access-guard";
import { watchDeviceBanRealtime } from "@/lib/ban-realtime";

export const Route = createFileRoute("/blocked")({
  head: () => ({
    meta: [
      { title: "404" },
      { name: "description", content: "Trang không khả dụng." },
      { property: "og:title", content: "404 | Diễn Đàn FWB" },
      { property: "og:description", content: "Trang không khả dụng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  // Tự giải phóng: nếu Admin đã gỡ khóa (tài khoản + thiết bị đều sạch trong DB)
  // thì xoá cờ dính của thiết bị và trả người dùng về trang chủ.
  useEffect(() => {
    let alive = true;
    const stop = watchDeviceBanRealtime();
    const verify = async () => {
      invalidateGateCache();
      const gate = await securityGate(true);
      if (!alive) return;
      if (!gate.blocked) {
        clearDeviceBlockedSticky();
        window.location.replace("/");
      }
    };
    void verify();
    const stopPoll = visibleInterval(verify, 60_000);
    return () => {
      alive = false;
      stopPoll();
      stop();
    };
  }, []);

  return <BlockedScreen />;
}
