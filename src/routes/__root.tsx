import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";

import { VerificationGate } from "@/components/candy/verification-gate";
import { AccessGate } from "@/components/candy/access-gate";
import { PopupRenderer } from "@/components/candy/popup-renderer";
import { PopupEngine } from "@/components/candy/popup-engine";
import { ExternalLinkGuard } from "@/components/ExternalLinkGuard";
import { SiteIconSync } from "@/components/candy/site-icon-sync";
import { OverlayGuard } from "@/components/candy/overlay-guard";


export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { title: "Diễn Đàn FWB — Kết nối uy tín" },
      { property: "og:title", content: "Diễn Đàn FWB — Kết nối uy tín" },
      { name: "twitter:title", content: "Diễn Đàn FWB — Kết nối uy tín" },
      { name: "description", content: "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè." },
      { property: "og:description", content: "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè." },
      { name: "twitter:description", content: "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44f4a779a311044982fa33065959da89/id-preview-f06cd52a--3f15d7c7-881f-4b36-bf8e-fb0397416114.lovable.app-1786704231411.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/44f4a779a311044982fa33065959da89/id-preview-f06cd52a--3f15d7c7-881f-4b36-bf8e-fb0397416114.lovable.app-1786704231411.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800;900&family=Montserrat:wght@800;900&family=Urbanist:wght@800;900&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icon-180.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <Outlet />,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // QueryClient cấp gốc: các gate + route lẻ (harness test) cũng dùng được
  // React Query; staleTime 5 phút giúp cache profiles không refetch khi lướt.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // /blocked là route duy nhất người bị Block Level 3 được thấy:
  // không gate phụ, không overlay, không popup, không header/footer.
  if (pathname === "/blocked")
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );

  return (
    <QueryClientProvider client={queryClient}>
    <AccessGate>
        <VerificationGate>
          <OverlayGuard />
          <SiteIconSync />
          <ExternalLinkGuard />
          <PopupRenderer />
          <PopupEngine />

          <Outlet />
        </VerificationGate>
    </AccessGate>
    </QueryClientProvider>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Dọn cờ block toàn cục cũ (fwb_blk / fwb_block_info) — trước đây gây block oan. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.cookie='fwb_blk=; path=/; max-age=0; SameSite=Lax';localStorage.removeItem('fwb_block_info');sessionStorage.removeItem('fwb_block_info');localStorage.removeItem('fwb_dev_blk');sessionStorage.removeItem('fwb_dev_blk');}catch(e){}})();`,
          }}
        />

        

      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
