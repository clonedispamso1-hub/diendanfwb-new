import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [
    { title: "Thông báo — Diễn Đàn FWB" },
    { name: "description", content: "Thông báo trên Diễn Đàn FWB." },
    { property: "og:title", content: "Thông báo — Diễn Đàn FWB" },
    { property: "og:description", content: "Thông báo trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Notifications"),
});
