import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/settings/profile")({
  head: () => ({ meta: [
    { title: "Chỉnh sửa hồ sơ — Diễn Đàn FWB" },
    { name: "description", content: "Chỉnh sửa hồ sơ trên Diễn Đàn FWB." },
    { property: "og:title", content: "Chỉnh sửa hồ sơ — Diễn Đàn FWB" },
    { property: "og:description", content: "Chỉnh sửa hồ sơ trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
