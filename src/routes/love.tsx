import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/love")({
  head: () => ({ meta: [
    { title: "Tình yêu — Diễn Đàn FWB" },
    { name: "description", content: "Tình yêu trên Diễn Đàn FWB." },
    { property: "og:title", content: "Tình yêu — Diễn Đàn FWB" },
    { property: "og:description", content: "Tình yêu trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
