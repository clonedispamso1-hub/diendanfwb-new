import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { readBlock, type GateResult } from "@/lib/access-guard";
import { BlockedScreen } from "@/components/candy/blocked-screen";

export const Route = createFileRoute("/blocked")({
  head: () => ({
    meta: [
      { title: "Truy cập bị khóa | Diễn Đàn FWB" },
      { name: "description", content: "Tài khoản, thiết bị hoặc địa chỉ IP của bạn đã bị khóa truy cập Diễn Đàn FWB." },
      { property: "og:title", content: "Truy cập bị khóa | Diễn Đàn FWB" },
      { property: "og:description", content: "Tài khoản, thiết bị hoặc địa chỉ IP của bạn đã bị khóa truy cập Diễn Đàn FWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  const [info, setInfo] = useState<GateResult | null>(null);
  useEffect(() => { setInfo(readBlock()); }, []);
  return <BlockedScreen info={info} />;
}
