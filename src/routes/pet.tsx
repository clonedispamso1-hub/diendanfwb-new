import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/pet")({
  head: () => ({ meta: [
    { title: "Thú cưng — Diễn Đàn FWB" },
    { name: "description", content: "Thú cưng trên Diễn Đàn FWB." },
    { property: "og:title", content: "Thú cưng — Diễn Đàn FWB" },
    { property: "og:description", content: "Thú cưng trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
