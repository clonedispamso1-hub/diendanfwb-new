import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAuthProvider } from "@/components/candy/mock-auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { LeaderboardBadgesProvider } from "@/components/candy/leaderboard-badges-provider";
import { CandyAppInner } from "@/components/candy/app-shell";

/**
 * Test-harness route — CHỈ dùng cho Playwright + mock auth.
 * Mount TOÀN BỘ app shell (Header + BottomNav + FeedbackPage) tại /feedback
 * để kiểm tra 2 thanh nav không bị mất trên mobile. KHÔNG link từ UI thật.
 */
function TestFeedbackShellHarness() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <MockAuthProvider>
        <NotificationProvider>
          <LeaderboardBadgesProvider>
            <MemoryRouter initialEntries={["/feedback"]}>
              <CandyAppInner />
            </MemoryRouter>
          </LeaderboardBadgesProvider>
        </NotificationProvider>
      </MockAuthProvider>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/__test/feedback-shell")({
  head: () => ({
    meta: [
      { title: "Test Feedback Shell | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho khung app tại Feedback." },
      { property: "og:title", content: "Test Feedback Shell | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho khung app tại Feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestFeedbackShellHarness,
});
