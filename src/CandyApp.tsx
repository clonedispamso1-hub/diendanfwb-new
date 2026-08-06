import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { VipGiftBroadcaster } from "@/components/candy/vip-gift/vip-gift-broadcaster";
import { ScreenshotGuard } from "@/components/candy/screenshot-guard";
import { InventorySheet } from "@/components/candy/inventory/InventorySheet";
import { AuthProvider } from "@/components/candy/auth-provider";
import { WarningNotificationPopup } from "@/components/candy/warning-notification-popup";

import { RestrictionPopupHost } from "@/components/candy/restriction-popup";
import { ZaloUpdatePopup } from "@/components/candy/zalo-update-popup";
import { RequiredPopup } from "@/components/candy/required-popup";
import { LiveNewRoomPopup } from "@/components/candy/live/live-new-room-popup";

import { lazyWithRetry } from "@/lib/lazy-with-retry";
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
const AdminLoginPage = lazyWithRetry(() => import("./pages/admin/AdminLoginPage.tsx"));
const AdminBotsPage = lazyWithRetry(() => import("./pages/AdminBotsPage.tsx"));

const AdminPendingPage = lazyWithRetry(() => import("./pages/admin/AdminPendingPage.tsx"));
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

const initialRoute = typeof window !== "undefined"
  ? `${window.location.pathname}${window.location.search}${window.location.hash}`
  : "/";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-center" richColors closeButton />
      <VipGiftBroadcaster />
      <ScreenshotGuard />
      <AuthProvider>
        <InventorySheet />
        <WarningNotificationPopup />
        <RestrictionPopupHost />
        <ZaloUpdatePopup />
        {/* Wizard xác minh 3 bước — chỉ hiện sau khi đăng nhập. */}
        <RequiredPopup />
        {/* Thông báo có phòng Live mới (Realtime DB #2). */}
        <LiveNewRoomPopup />

      </AuthProvider>

      <MemoryRouter initialEntries={[initialRoute]}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/post/:postId" element={<Index />} />
            <Route path="/chat" element={<Index />} />
            <Route path="/chat/:userId" element={<Index />} />
            <Route path="/profile" element={<Index />} />
            <Route path="/profile/:userId" element={<Index />} />
            <Route path="/fwb" element={<Index />} />
            <Route path="/find-fwb" element={<Index />} />
            <Route path="/guide" element={<Index />} />
            <Route path="/huong-dan" element={<Index />} />
            <Route path="/feedback" element={<Navigate to="/guide" replace />} />
            <Route path="/live18" element={<Navigate to="/guide" replace />} />
            <Route path="/quan-trong" element={<Navigate to="/guide" replace />} />
            <Route path="/important" element={<Navigate to="/guide" replace />} />
            <Route path="/pet" element={<Index />} />
            <Route path="/connect" element={<Index />} />
            <Route path="/taixiu" element={<Index />} />
            <Route path="/ket-noi-bi-mat" element={<Index />} />
            <Route path="/keo-bua-bao" element={<Navigate to="/ket-noi-bi-mat" replace />} />
            <Route path="/rps" element={<Navigate to="/ket-noi-bi-mat" replace />} />
            <Route path="/love" element={<Index />} />
            <Route path="/suggested" element={<Suggested />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/gem-history" element={<GemHistory />} />
            <Route path="/wallet" element={<Navigate to="/" replace />} />
            {ADMIN_ENABLED ? (
              <>
                <Route path={`/${ADMIN_SLUG}`} element={<AdminPage />} />
                <Route path={`/${ADMIN_SLUG}/login`} element={<AdminLoginPage />} />
                <Route path={`/${ADMIN_SLUG}/pending`} element={<AdminPendingPage />} />
                <Route path={`/${ADMIN_SLUG}/approvals`} element={<AdminApprovalsPage />} />
                <Route path={`/${ADMIN_SLUG}/bots`} element={<AdminBotsPage />} />
              </>
            ) : null}
            <Route path="/verify" element={<VerifyProfile />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/account/:userId" element={<AccountHistory />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
