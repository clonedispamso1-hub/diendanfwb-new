/**
 * AccessGate — cổng chặn Block Level 3.
 *
 * Sau bản fix khẩn cấp:
 * - KHÔNG chặn dựa trên cookie / localStorage / sessionStorage.
 * - KHÔNG chặn theo IP hay mạng Wi-Fi.
 * - Chỉ chặn khi backend xác nhận: tài khoản hiện tại Level 3, hoặc thiết bị này
 *   đã từng đăng nhập một tài khoản Level 3.
 * - Fail-open: lỗi mạng / RPC lỗi → cho dùng bình thường.
 * - Render children NGAY, kiểm tra chạy nền → không tạo loading chờ vô ích.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { securityGate, forceLogout, clearBlock, type GateResult } from "@/lib/access-guard";
import { BlockedScreen } from "@/components/candy/blocked-screen";

const POLL_MS = 5 * 60_000;

export function AccessGate({ children }: { children: ReactNode }) {
  const busy = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [info, setInfo] = useState<GateResult | null>(null);

  const check = useCallback(async () => {
    if (typeof window === "undefined" || busy.current) return;
    busy.current = true;
    try {
      const gate = await securityGate();
      if (gate.blocked && !gate.admin) {
        setInfo(gate);
        setBlocked(true);
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
      } else {
        setInfo(null);
        setBlocked(false);
      }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // Dọn cờ block toàn cục tồn đọng từ phiên bản cũ (nguyên nhân block oan).
    clearBlock();
    void check();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);

    let channel: any = null;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      channel = supabase
        .channel(`forced-logout-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "forced_logouts", filter: `user_id=eq.${uid}` },
          (payload: any) => {
            void forceLogout({
              blocked: true,
              scope: "member",
              level: 3,
              reason: payload?.new?.reason ?? null,
              message: "Tài khoản của bạn vừa bị khóa bởi Ban quản trị.",
            });
          },
        )
        .subscribe();
    })();

    return () => {
      window.clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [check]);

  if (blocked) return <BlockedScreen info={info} />;
  return <>{children}</>;
}
