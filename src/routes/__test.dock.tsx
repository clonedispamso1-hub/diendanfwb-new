import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";

/**
 * Test-harness route — CHỈ dùng để kiểm thử FloatingDock (Playwright / QA).
 *
 * Mount đúng component thật `@/components/candy/floating-dock` mà website đang
 * dùng trong `app-shell.tsx`, kèm cấu hình thật đọc từ Admin Panel
 * (site setting `floating_dock`). Không login thật.
 *
 * KHÔNG link tới route này từ UI thật. Không index (noindex).
 */

const FloatingDock = lazy(() =>
  import("@/components/candy/floating-dock").then((m) => ({ default: m.FloatingDock })),
);

function TestDockHarness() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <BrowserRouter>
      <div
        data-testid="test-dock-harness"
        style={{ minHeight: "100vh", padding: 24, background: "#f6f7f9" }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Kiểm thử Floating Dock</h1>
        <p style={{ fontSize: 14, opacity: 0.7 }}>
          Dock thật + cấu hình thật từ Admin Panel. Bấm icon để xem popup.
        </p>
        <Suspense fallback={<div data-testid="dock-loading">Loading dock…</div>}>
          <FloatingDock />
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export const Route = createFileRoute("/__test/dock")({
  head: () => ({
    meta: [
      { title: "Test Floating Dock | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho Floating Dock." },
      { property: "og:title", content: "Test Floating Dock | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho Floating Dock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestDockHarness,
});
