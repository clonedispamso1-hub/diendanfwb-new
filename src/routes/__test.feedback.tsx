import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAuthProvider } from "@/components/candy/mock-auth-provider";

/**
 * Test-harness route — CHỈ dùng cho Playwright + mock Supabase.
 * Mount `FeedbackPage` với auth giả để kiểm tra render đủ N bài.
 * KHÔNG link tới route này từ UI thật (noindex).
 */
const FeedbackPage = lazy(() =>
  import("@/components/candy/feedback/feedback-page").then((m) => ({ default: m.FeedbackPage })),
);

function TestFeedbackHarness() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
    <MockAuthProvider>
      <div data-testid="test-feedback-harness" style={{ minHeight: "100vh" }}>
        <Suspense fallback={<div data-testid="feedback-loading">Loading…</div>}>
          <FeedbackPage />
        </Suspense>
      </div>
    </MockAuthProvider>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/__test/feedback")({
  head: () => ({
    meta: [
      { title: "Test Feedback | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho danh sách Feedback." },
      { property: "og:title", content: "Test Feedback | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho danh sách Feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestFeedbackHarness,
});
