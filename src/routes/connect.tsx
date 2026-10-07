import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/connect")({
  head: () => ({ meta: [
    { title: "Kết nối — Diễn Đàn FWB" },
    { name: "description", content: "Kết nối trên Diễn Đàn FWB." },
    { property: "og:title", content: "Kết nối — Diễn Đàn FWB" },
    { property: "og:description", content: "Kết nối trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
