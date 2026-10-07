import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/u/$userId")({
  head: () => ({ meta: [
    { title: "Thành viên — Diễn Đàn FWB" },
    { name: "description", content: "Thành viên trên Diễn Đàn FWB." },
    { property: "og:title", content: "Thành viên — Diễn Đàn FWB" },
    { property: "og:description", content: "Thành viên trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
