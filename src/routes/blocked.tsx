import { createFileRoute } from "@tanstack/react-router";
import { BlockedScreen } from "@/components/candy/blocked-screen";

export const Route = createFileRoute("/blocked")({
  head: () => ({
    meta: [
      { title: "404" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  return <BlockedScreen />;
}
