import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [
    { title: "Nhật ký hoạt động — Diễn Đàn FWB" },
    { name: "description", content: "Nhật ký hoạt động trên Diễn Đàn FWB." },
    { property: "og:title", content: "Nhật ký hoạt động — Diễn Đàn FWB" },
    { property: "og:description", content: "Nhật ký hoạt động trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("ActivityLog"),
});
