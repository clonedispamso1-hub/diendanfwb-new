import { createFileRoute, notFound } from "@tanstack/react-router";
import { SeverPicker } from "@/components/candy/sever-picker";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/qa-sever-lock")({
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  head: () => ({ meta: [
    { title: "Kiểm thử khóa Sever — Diễn Đàn FWB" },
    { name: "description", content: "Kiểm thử nội bộ luồng khóa khu vực và chuyển về Sever Hỗn Tạp." },
    { property: "og:title", content: "Kiểm thử khóa Sever — Diễn Đàn FWB" },
    { property: "og:description", content: "Kiểm thử nội bộ luồng khóa khu vực và chuyển về Sever Hỗn Tạp." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: SeverLockHarness,
});

function SeverLockHarness() {
  const [clicks, setClicks] = useState(0);
  return <main className="bg-background text-foreground min-h-screen p-6">
    <SeverPicker />
    <Button onClick={() => setClicks((v) => v + 1)}>Thao tác nền {clicks}</Button>
  </main>;
}