import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BlockedScreen } from "@/components/candy/blocked-screen";
import {
  securityGate,
  invalidateGateCache,
  isDeviceBlockedSticky,
  clearDeviceBlockedSticky,
} from "@/lib/access-guard";
import { supabase } from "@/integrations/supabase/client";

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
  // Một lần kiểm tra duy nhất khi mở trang (không polling, không realtime).
  //
  // QUAN TRỌNG: sau khi bị khóa, session đã bị xoá sạch → securityGate() chạy ở
  // trạng thái ẩn danh sẽ trả về "open" và trước đây đẩy người dùng về "/" (rơi
  // vào màn đăng nhập sau ~5 giây). Nay chỉ rời /blocked khi:
  //   - thiết bị KHÔNG còn nằm trong danh sách cấm, VÀ
  //   - còn phiên đăng nhập hợp lệ và tài khoản đó đã được gỡ khóa.
  useEffect(() => {
    let alive = true;
    invalidateGateCache();
    void (async () => {
      try {
        const gate = await securityGate(true);
        if (!alive) return;

        // Thiết bị vẫn bị cấm → ở lại /blocked vĩnh viễn.
        if (gate.blocked && !gate.admin) return;

        // Không có session (vừa bị purge) → KHÔNG điều hướng đi đâu cả.
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        if (!data.session?.user) return;

        // Có session hợp lệ + gate mở → tài khoản đã được gỡ khóa.
        if (isDeviceBlockedSticky()) clearDeviceBlockedSticky();
        window.location.replace("/");
      } catch { /* fail-safe: ở lại trang này */ }
    })();
    return () => { alive = false; };
  }, []);

  return <BlockedScreen />;
}
