import { Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/components/candy/auth-provider";
import { DeferredMount } from "@/components/candy/deferred-mount";
import { AppLoading } from "@/components/candy/app-loading";
import { supabase } from "@/lib/db/router";
import { AUTOMATION_ENABLED } from "@/lib/automation-flags";

import { lazyWithRetry } from "@/lib/lazy-with-retry";

// Overlay/popup host: không cần cho lần vẽ đầu tiên -> tách bundle + mount khi rảnh.
const VipGiftBroadcaster = lazyWithRetry(() =>
  import("@/components/candy/vip-gift/vip-gift-broadcaster").then((m) => ({ default: m.VipGiftBroadcaster })),
);
const ScreenshotGuard = lazyWithRetry(() =>
  import("@/components/candy/screenshot-guard").then((m) => ({ default: m.ScreenshotGuard })),
);
const InventorySheet = lazyWithRetry(() =>
  import("@/components/candy/inventory/InventorySheet").then((m) => ({ default: m.InventorySheet })),
);
const WarningNotificationPopup = lazyWithRetry(() =>
  import("@/components/candy/warning-notification-popup").then((m) => ({ default: m.WarningNotificationPopup })),
);
const RestrictionPopupHost = lazyWithRetry(() =>
  import("@/components/candy/restriction-popup").then((m) => ({ default: m.RestrictionPopupHost })),
);
const LiveNewRoomPopup = lazyWithRetry(() =>
  import("@/components/candy/live/live-new-room-popup").then((m) => ({ default: m.LiveNewRoomPopup })),
);

import { ADMIN_ENABLED, ADMIN_SLUG } from "@/lib/admin-slug";

// Route phụ — lazy với retry để tránh crash khi chunk load fail (deploy mới / mạng chập).
const Suggested = lazyWithRetry(() => import("./pages/Suggested.tsx"));
const ActivityLog = lazyWithRetry(() => import("./pages/ActivityLog.tsx"));
const GemHistory = lazyWithRetry(() => import("./pages/GemHistory.tsx"));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage.tsx"));
const VerifyProfile = lazyWithRetry(() => import("./pages/VerifyProfile.tsx"));
const NotificationsPage = lazyWithRetry(() => import("./pages/Notifications.tsx"));
const AccountHistory = lazyWithRetry(() => import("./pages/AccountHistory.tsx"));
const InventoryPage = lazyWithRetry(() => import("./pages/Inventory.tsx"));
const WithdrawPage = lazyWithRetry(() => import("./pages/WithdrawPage.tsx"));
const VipCommunityPage = lazyWithRetry(() => import("./pages/VipCommunity.tsx"));
const AdminLoginPage = lazyWithRetry(() => import("./pages/admin/AdminLoginPage.tsx"));
const AdminBotsPage = lazyWithRetry(() => import("./pages/AdminBotsPage.tsx"));
const AdminPendingPage = lazyWithRetry(() => import("./pages/admin/AdminPendingPage.tsx"));
const AdminRegisterPage = lazyWithRetry(() => import("./pages/admin/AdminRegisterPage.tsx"));
const AdminApprovalsPage = lazyWithRetry(() => import("./pages/admin/AdminApprovalsPage.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// MemoryRouter không ghi vào window.location, nên khi cây React remount
// (ví dụ gate kiểm tra lại quyền) route trong bộ nhớ sẽ mất và app rơi về "/".
// Lưu route hiện tại vào sessionStorage để remount vẫn ở đúng trang (Admin Panel).
const ROUTE_KEY = "fwb_current_route";

function readInitialRoute(): string {
  if (typeof window === "undefined") return "/";
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  // URL thật đã trỏ tới một trang cụ thể → ưu tiên URL.
  if (url !== "/") return url;
  // URL là "/" (điều hướng trong bộ nhớ) → khôi phục trang đang mở trước đó.
  try {
    const saved = sessionStorage.getItem(ROUTE_KEY);
    if (saved && saved.startsWith("/")) return saved;
  } catch { /* ignore */ }
  return url;
}

const initialRoute = readInitialRoute();

/** Ghi nhớ route hiện tại của MemoryRouter. */
function RouteMemory() {
  const location = useLocation();
  useEffect(() => {
    try {
      sessionStorage.setItem(
        ROUTE_KEY,
        `${location.pathname}${location.search}${location.hash}`,
      );
    } catch { /* ignore */ }
  }, [location.pathname, location.search, location.hash]);
  return null;
}

const App = () => {
  // Automation tắt toàn cục: không tự gọi RPC nào khi website khởi động.
  useEffect(() => {
    if (!AUTOMATION_ENABLED) return;
    void supabase.rpc("run_daily_wallet_maintenance");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-center" richColors closeButton />
      <DeferredMount>
        <Suspense fallback={null}>
          <VipGiftBroadcaster />
          <ScreenshotGuard />
        </Suspense>
      </DeferredMount>
      <AuthProvider>
        <DeferredMount>
          <Suspense fallback={null}>
            <InventorySheet />
            <WarningNotificationPopup />
            <RestrictionPopupHost />
            {/* Thông báo có phòng Live mới (Realtime DB #2). */}
            <LiveNewRoomPopup />
          </Suspense>
        </DeferredMount>
      </AuthProvider>


      <MemoryRouter initialEntries={[initialRoute]}>
        <RouteMemory />
        <Suspense
          fallback={
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
              <AppLoading label="Đang tải…" size="lg" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/post/:postId" element={<Index />} />
            <Route path="/chat" element={<Index />} />
            <Route path="/chat/:userId" element={<Index />} />
            <Route path="/profile" element={<Index />} />
            <Route path="/profile/:userId" element={<Index />} />
            {/* Hồ sơ người khác = trang con (push overlay) — KHÔNG đổi tab, không reload feed */}
            <Route path="/u/:userId" element={<Index />} />
            <Route path="/fwb" element={<Index />} />
            <Route path="/find-fwb" element={<Index />} />
            <Route path="/guide" element={<Index />} />
            <Route path="/huong-dan" element={<Index />} />
            <Route path="/feedback" element={<Index />} />
            <Route path="/live18" element={<Navigate to="/guide" replace />} />
            <Route path="/quan-trong" element={<Navigate to="/guide" replace />} />
            <Route path="/important" element={<Navigate to="/guide" replace />} />
            <Route path="/pet" element={<Index />} />
            <Route path="/connect" element={<Index />} />
            <Route path="/taixiu" element={<Index />} />
            <Route path="/ket-noi-bi-mat" element={<Navigate to="/" replace />} />
            <Route path="/keo-bua-bao" element={<Navigate to="/" replace />} />
            <Route path="/rps" element={<Navigate to="/" replace />} />
            <Route path="/love" element={<Index />} />
            <Route path="/suggested" element={<Suggested />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/gem-history" element={<GemHistory />} />
            <Route path="/wallet/withdraw" element={<WithdrawPage />} />
            <Route path="/wallet" element={<Navigate to="/" replace />} />
            {ADMIN_ENABLED ? (
              <>
                <Route path={`/${ADMIN_SLUG}`} element={<AdminPage />} />
                <Route path={`/${ADMIN_SLUG}/login`} element={<AdminLoginPage />} />
                <Route path={`/${ADMIN_SLUG}/register`} element={<AdminRegisterPage />} />
                <Route path={`/${ADMIN_SLUG}/pending`} element={<AdminPendingPage />} />
                <Route path={`/${ADMIN_SLUG}/approvals`} element={<AdminApprovalsPage />} />
                <Route path={`/${ADMIN_SLUG}/bots`} element={<AdminBotsPage />} />
                {/* Mọi sub-path admin lạ → về Admin Panel gốc, không rơi vào NotFound. */}
                <Route path={`/${ADMIN_SLUG}/*`} element={<Navigate to={`/${ADMIN_SLUG}`} replace />} />
              </>
            ) : null}
            <Route path="/verify" element={<VerifyProfile />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/account/:userId" element={<AccountHistory />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/vip-community" element={<VipCommunityPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
