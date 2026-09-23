import { createFileRoute } from "@tanstack/react-router";

// Xem ghi chú ở src/routes/index.tsx: app chính mount tại __root.tsx nên route
// catch-all này chỉ khai báo metadata, không render lại cây app (tránh F5 giả).
export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Diễn Đàn FWB — Kết nối uy tín" },
      {
        name: "description",
        content:
          "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè.",
      },
      { property: "og:title", content: "Diễn Đàn FWB — Kết nối uy tín" },
      {
        property: "og:description",
        content:
          "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
