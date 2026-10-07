import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/eighteen")({
  head: () => ({ meta: [
    { title: "Cộng đồng 18+ — Diễn Đàn FWB" },
    { name: "description", content: "Cộng đồng 18+ trên Diễn Đàn FWB." },
    { property: "og:title", content: "Cộng đồng 18+ — Diễn Đàn FWB" },
    { property: "og:description", content: "Cộng đồng 18+ trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
