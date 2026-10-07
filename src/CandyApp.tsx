import { Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
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
const ScreenshotGuard = lazyWithRetry(() =>
  import("@/components/candy/screenshot-guard").then((m) => ({ default: m.ScreenshotGuard })),
);
const InventorySheet = lazyWithRetry(() =>
  import("@/components/candy/inventory/InventorySheet").then((m) => ({
    default: m.InventorySheet,
  })),
);
const WarningNotificationPopup = lazyWithRetry(() =>
  import("@/components/candy/warning-notification-popup").then((m) => ({
    default: m.WarningNotificationPopup,
  })),
);
const RestrictionPopupHost = lazyWithRetry(() =>
  import("@/components/candy/restriction-popup").then((m) => ({ default: m.RestrictionPopupHost })),
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
            <ScreenshotGuard />
          </Suspense>
        </DeferredMount>
        {/* MỘT AuthProvider duy nhất bao trùm cả popup host lẫn toàn bộ router.
          Trước đây router nằm NGOÀI provider → mọi trang (kể cả màn đăng nhập)
          nhận context rỗng và login trả về "Auth chưa sẵn sàng". */}
        <AuthProvider>
          <DeferredMount>
            <Suspense fallback={null}>
              <InventorySheet />
              <WarningNotificationPopup />
              <RestrictionPopupHost />
            </Suspense>
          </DeferredMount>

          <Outlet />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
