import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [
    { title: "Hồ sơ thành viên — Diễn Đàn FWB" },
    { name: "description", content: "Hồ sơ thành viên trên Diễn Đàn FWB." },
    { property: "og:title", content: "Hồ sơ thành viên — Diễn Đàn FWB" },
    { property: "og:description", content: "Hồ sơ thành viên trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
