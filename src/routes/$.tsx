import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
import { ADMIN_ENABLED, ADMIN_SLUG } from "@/lib/admin-slug";

// Xem ghi chú ở src/routes/index.tsx: app chính mount tại __root.tsx nên route
// catch-all này chỉ khai báo metadata, không render lại cây app (tránh F5 giả).
export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Trang khác — Diễn Đàn FWB" },
      {
        name: "description",
        content:
          "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè.",
      },
      { property: "og:title", content: "Trang khác — Diễn Đàn FWB" },
      {
        property: "og:description",
        content:
          "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdditionalPage,
});

function AdditionalPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pages: Record<string, string> = { login: "AdminLoginPage", register: "AdminRegisterPage", pending: "AdminPendingPage", approvals: "AdminApprovalsPage", bots: "AdminBotsPage" };
  const isAdmin = ADMIN_ENABLED && (pathname === `/${ADMIN_SLUG}` || pathname.startsWith(`/${ADMIN_SLUG}/`));
  const suffix = pathname.slice(ADMIN_SLUG.length + 2);
  const name = isAdmin ? (pages[suffix] ? (suffix === "bots" ? "AdminBotsPage" : `admin/${pages[suffix]}`) : "AdminPage") : "NotFound";
  const Page = importedPage(name);
  return <Page />;
}
