import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/settings/password")({
  head: () => ({ meta: [
    { title: "Đổi mật khẩu — Diễn Đàn FWB" },
    { name: "description", content: "Đổi mật khẩu trên Diễn Đàn FWB." },
    { property: "og:title", content: "Đổi mật khẩu — Diễn Đàn FWB" },
    { property: "og:description", content: "Đổi mật khẩu trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
