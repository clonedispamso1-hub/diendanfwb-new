import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/wallet/withdraw")({
  head: () => ({ meta: [
    { title: "Rút tiền — Diễn Đàn FWB" },
    { name: "description", content: "Rút tiền trên Diễn Đàn FWB." },
    { property: "og:title", content: "Rút tiền — Diễn Đàn FWB" },
    { property: "og:description", content: "Rút tiền trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("WithdrawPage"),
});
