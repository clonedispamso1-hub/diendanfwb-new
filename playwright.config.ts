import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for ZALOVE.
 *
 * Test suite tại `tests/playwright/` chạy hoàn toàn dựa trên MOCK network
 * (page.route Supabase REST + Realtime), không cần credential thật.
 *
 * Dev server phải chạy sẵn ở http://localhost:8080 (Vite). Nếu muốn Playwright
 * tự spawn server, bật `webServer` bên dưới.
 */
export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 1800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // webServer: {
  //   command: "bun run dev",
  //   url: "http://localhost:8080",
  //   reuseExistingServer: true,
  //   timeout: 60_000,
  // },
});
