import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [
    { title: "Trò chuyện — Diễn Đàn FWB" },
    { name: "description", content: "Trò chuyện trên Diễn Đàn FWB." },
    { property: "og:title", content: "Trò chuyện — Diễn Đàn FWB" },
    { property: "og:description", content: "Trò chuyện trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
