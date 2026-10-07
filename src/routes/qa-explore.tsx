import { createFileRoute, notFound } from "@tanstack/react-router";
import { MockAuthProvider } from "@/components/candy/mock-auth-provider";
import { ConnectPage } from "@/components/candy/connect-page";

export const Route = createFileRoute("/qa-explore")({
  // Trang kiểm thử dùng user giả — chỉ tồn tại ở development.
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  head: () => ({ meta: [
    { title: "Kiểm tra cài đặt kết nối | Diễn Đàn FWB" },
    { name: "description", content: "Kiểm tra giao diện cài đặt kết nối." },
    { property: "og:title", content: "Kiểm tra cài đặt kết nối | Diễn Đàn FWB" },
    { property: "og:description", content: "Kiểm tra giao diện cài đặt kết nối." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: () => <MockAuthProvider me={{ province: "Hải Phòng", location: "Hải Phòng" }}><ConnectPage /></MockAuthProvider>,
});