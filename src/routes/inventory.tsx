import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [
    { title: "Kho đồ — Diễn Đàn FWB" },
    { name: "description", content: "Kho đồ trên Diễn Đàn FWB." },
    { property: "og:title", content: "Kho đồ — Diễn Đàn FWB" },
    { property: "og:description", content: "Kho đồ trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Inventory"),
});
