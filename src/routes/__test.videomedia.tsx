import { createFileRoute } from "@tanstack/react-router";
import { PostMedia } from "@/components/candy/post-media";

const URL_ =
  "https://pub-877370bd26ca441294f1b74567432e8a.r2.dev/posts/1789235796483-c410aa-scr-game-blackjack.mp4";

function Harness() {
  return (
    <div data-testid="video-harness" style={{ padding: 12, minHeight: "100vh" }}>
      <div className="pc-media">
        <PostMedia urls={[URL_]} alt="video test" />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/__test/videomedia")({
  head: () => ({
    meta: [
      { title: "Test Video Media | Diễn Đàn FWB" },
      { name: "description", content: "Màn hình kiểm thử nội bộ cho khối video bài viết." },
      { property: "og:title", content: "Test Video Media | Diễn Đàn FWB" },
      { property: "og:description", content: "Màn hình kiểm thử nội bộ cho khối video bài viết." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Harness,
});
