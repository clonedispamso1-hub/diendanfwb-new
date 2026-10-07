import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/fwb")({
  head: () => ({ meta: [
    { title: "FWB — Diễn Đàn FWB" },
    { name: "description", content: "FWB trên Diễn Đàn FWB." },
    { property: "og:title", content: "FWB — Diễn Đàn FWB" },
    { property: "og:description", content: "FWB trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
