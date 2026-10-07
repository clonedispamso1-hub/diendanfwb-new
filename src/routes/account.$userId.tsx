import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/account/$userId")({
  head: () => ({ meta: [
    { title: "Lịch sử tài khoản — Diễn Đàn FWB" },
    { name: "description", content: "Lịch sử tài khoản trên Diễn Đàn FWB." },
    { property: "og:title", content: "Lịch sử tài khoản — Diễn Đàn FWB" },
    { property: "og:description", content: "Lịch sử tài khoản trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("AccountHistory"),
});
