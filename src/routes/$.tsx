import { createFileRoute } from "@tanstack/react-router";
import { LegacyApp } from "@/legacy-app-mount";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Diễn Đàn FWB — Kết nối uy tín" },
      { name: "description", content: "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè." },
      { property: "og:title", content: "Diễn Đàn FWB — Kết nối uy tín" },
      { property: "og:description", content: "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LegacyApp,
});
