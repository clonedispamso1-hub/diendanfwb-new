import { createFileRoute } from "@tanstack/react-router";
import { LockedAccountScreen } from "@/components/admin-v1/redesign/LockedAccountScreen";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/locked")({
  head: () => ({
    meta: [
      { title: "Tài khoản đã bị khóa | Diễn Đàn FWB" },
      { name: "description", content: "Thông tin trạng thái tài khoản Diễn Đàn FWB đã bị khóa." },
      { property: "og:title", content: "Tài khoản đã bị khóa | Diễn Đàn FWB" },
      { property: "og:description", content: "Thông tin trạng thái tài khoản Diễn Đàn FWB đã bị khóa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LockedPage,
});

function LockedPage() {
  // TODO: nối Supabase — đọc profile hiện tại (avatar, username, uid, vip).
  const [username, setUsername] = useState("Người dùng");
  const [uid, setUid] = useState("UID_LOCAL");
  useEffect(() => {
    setUsername(localStorage.getItem("ddx-mock-username") || "Người dùng");
    setUid(localStorage.getItem("ddx-mock-uid") || "UID_LOCAL");
  }, []);
  return (
    <LockedAccountScreen
      username={username}
      uid={uid}
      vip={false}
      onLogout={() => {
        // TODO: gọi supabase.auth.signOut()
        window.location.href = "/";
      }}
    />
  );
}
