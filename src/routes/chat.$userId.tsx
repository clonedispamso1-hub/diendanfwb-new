import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/chat/$userId")({
  head: () => ({ meta: [
    { title: "Tin nhắn — Diễn Đàn FWB" },
    { name: "description", content: "Tin nhắn trên Diễn Đàn FWB." },
    { property: "og:title", content: "Tin nhắn — Diễn Đàn FWB" },
    { property: "og:description", content: "Tin nhắn trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
