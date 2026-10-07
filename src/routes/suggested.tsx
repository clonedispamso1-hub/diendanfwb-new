import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/suggested")({
  head: () => ({ meta: [
    { title: "Gợi ý — Diễn Đàn FWB" },
    { name: "description", content: "Gợi ý trên Diễn Đàn FWB." },
    { property: "og:title", content: "Gợi ý — Diễn Đàn FWB" },
    { property: "og:description", content: "Gợi ý trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Suggested"),
});
