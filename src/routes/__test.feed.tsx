import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAuthProvider } from "@/components/candy/mock-auth-provider";

/**
 * Test-harness route — CHỈ dùng cho Playwright + mock Supabase.
 *
 * Mount `FeedPage` với `AuthContext` giả (không login thật). File
 * `tests/playwright/feed.spec.ts` navigate tới `/__test/feed` và assert
 * dựa vào network mock (`installSupabaseMocks`).
 *
 * KHÔNG được link tới route này từ UI thật. Không index (noindex).
 */

const FeedPage = lazy(() =>
  import("@/components/candy/feed-page").then((m) => ({ default: m.FeedPage })),
);

function TestFeedHarness() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5 * 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
    <MockAuthProvider>
      <div data-testid="test-feed-harness" style={{ minHeight: "100vh" }}>
        <Suspense fallback={<div data-testid="feed-loading">Loading FeedPage…</div>}>
          <FeedPage
            category="general"
            onViewProfile={() => {}}
            onOpenChat={() => {}}
            onOpenPost={() => {}}
            onOpenVideo={() => {}}
            onOpenFwbHub={() => {}}
            onOpenNotifications={() => {}}
            unreadCount={0}
          />
        </Suspense>
      </div>
    </MockAuthProvider>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/__test/feed")({
  head: () => ({
    meta: [
      { title: "Test Feed | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho bảng tin Diễn Đàn FWB." },
      { property: "og:title", content: "Test Feed | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho bảng tin Diễn Đàn FWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestFeedHarness,
});
