import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BlockedScreen } from "@/components/candy/blocked-screen";
import {
  invalidateGateCache,
  clearDeviceBlockedSticky,
} from "@/lib/access-guard";


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
  // KILL SWITCH (mở khóa khẩn cấp): mọi người truy cập /blocked đều được dọn
  // sạch cờ chặn cũ và đưa thẳng về trang chủ.
  useEffect(() => {
    invalidateGateCache();
    clearDeviceBlockedSticky();
    if (typeof window !== "undefined" && window.location.pathname === "/blocked") {
      window.location.replace("/");
    }
  }, []);

  return <BlockedScreen />;
}

