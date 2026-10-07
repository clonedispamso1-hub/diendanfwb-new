import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/post/$postId")({
  head: () => ({ meta: [
    { title: "Bài viết — Diễn Đàn FWB" },
    { name: "description", content: "Bài viết trên Diễn Đàn FWB." },
    { property: "og:title", content: "Bài viết — Diễn Đàn FWB" },
    { property: "og:description", content: "Bài viết trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
