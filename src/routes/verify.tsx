import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [
    { title: "Xác minh hồ sơ — Diễn Đàn FWB" },
    { name: "description", content: "Xác minh hồ sơ trên Diễn Đàn FWB." },
    { property: "og:title", content: "Xác minh hồ sơ — Diễn Đàn FWB" },
    { property: "og:description", content: "Xác minh hồ sơ trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("VerifyProfile"),
});
