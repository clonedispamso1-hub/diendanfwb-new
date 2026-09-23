import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BottomNav, type AppTab } from "@/components/candy/bottom-nav";

/**
 * Test-harness route — CHỈ dùng để kiểm thử BottomNav badge positioning.
 * KHÔNG link tới route này từ UI thật. Không index (noindex).
 */
function TestBottomNavHarness() {
  const [active, setActive] = useState<AppTab>("home");
  return (
    <div
      data-testid="test-bottom-nav-harness"
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#0b0b0d",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
        Kiểm thử BottomNav badge
      </h1>
      <p style={{ fontSize: 14, opacity: 0.7, color: "#fff" }}>
        unreadCount=99+ / feedbackNew=1 / liveCount=1
      </p>
      <BottomNav
        active={active}
        onChange={setActive}
        unreadCount={120}
      />
    </div>
  );
}

export const Route = createFileRoute("/__test/bottom-nav")({
  head: () => ({
    meta: [
      { title: "Test Bottom Nav | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho BottomNav." },
      { property: "og:title", content: "Test Bottom Nav | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho BottomNav." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestBottomNavHarness,
});
