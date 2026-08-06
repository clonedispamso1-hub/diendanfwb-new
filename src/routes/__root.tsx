import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { MaintenanceGate } from "@/components/candy/maintenance-gate";
import { VerificationGate } from "@/components/candy/verification-gate";
import { PopupRenderer } from "@/components/candy/popup-renderer";
import { PopupEngine } from "@/components/candy/popup-engine";
import { ExternalLinkGuard } from "@/components/ExternalLinkGuard";


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
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800;900&family=Montserrat:wght@800;900&family=Urbanist:wght@800;900&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icon-180.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <Outlet />,
});

function RootComponent() {
  return (
    <MaintenanceGate>
      <VerificationGate>
        <ExternalLinkGuard />
        <PopupRenderer />
        <PopupEngine />

        <Outlet />
      </VerificationGate>
    </MaintenanceGate>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='ddx-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:'light';var d=document.documentElement;if(t==='dark')d.classList.add('dark');else d.classList.remove('dark');}catch(e){document.documentElement.classList.remove('dark');}})();`,
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
