import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/vip-community")({
  head: () => ({ meta: [
    { title: "Cộng đồng VIP — Diễn Đàn FWB" },
    { name: "description", content: "Cộng đồng VIP trên Diễn Đàn FWB." },
    { property: "og:title", content: "Cộng đồng VIP — Diễn Đàn FWB" },
    { property: "og:description", content: "Cộng đồng VIP trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("VipCommunity"),
});
