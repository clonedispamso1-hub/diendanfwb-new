import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";

export const Route = createFileRoute("/feedback-zalo")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" && s.id ? { id: s.id } : {},
  head: () => ({ meta: [
    { title: "Feedback Zalo — Diễn Đàn FWB" },
    { name: "description", content: "Khu vực Feedback Zalo của Diễn Đàn FWB." },
    { property: "og:title", content: "Feedback Zalo — Diễn Đàn FWB" },
    { property: "og:description", content: "Khu vực Feedback Zalo của Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});