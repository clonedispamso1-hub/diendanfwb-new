import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/gem-history")({
  head: () => ({ meta: [
    { title: "Lịch sử số dư — Diễn Đàn FWB" },
    { name: "description", content: "Lịch sử số dư trên Diễn Đàn FWB." },
    { property: "og:title", content: "Lịch sử số dư — Diễn Đàn FWB" },
    { property: "og:description", content: "Lịch sử số dư trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("GemHistory"),
});
