/**
 * AccessGate — cổng chặn CỨNG toàn bộ website.
 * - Chạy security_gate() trước khi render bất kỳ route nào.
 * - Khi blocked: KHÔNG render children ở bất kỳ URL nào (kể cả khi user xóa
 *   /blocked, refresh, mở tab mới hay tab ẩn danh) → luôn hiển thị màn khóa
 *   và ép URL về /blocked.
 * - Fail-closed: lỗi mạng / RPC lỗi → coi như bị khóa (xem access-guard.ts).
 * - Chỉ Admin (gate.admin === true) mới được bỏ qua.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { securityGate, forceLogout, clearBlock, rememberBlock, readBlock, type GateResult } from "@/lib/access-guard";
import { BlockedScreen } from "@/components/candy/blocked-screen";

const SKIP = ["/maintenance"];
const POLL_MS = 60_000;

export function AccessGate({ children }: { children: ReactNode }) {
  const busy = useRef(false);
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");
  const [info, setInfo] = useState<GateResult | null>(null);

  const check = useCallback(async () => {
    if (typeof window === "undefined" || busy.current) return;
    if (SKIP.some((p) => window.location.pathname.startsWith(p))) {
      setStatus("allowed");
      return;
    }
    busy.current = true;
    try {
      const gate = await securityGate();
      if (gate.blocked && !gate.admin) {
        rememberBlock(gate);
        setInfo(gate);
        setStatus("blocked");
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        if (!window.location.pathname.startsWith("/blocked")) {
          window.history.replaceState(null, "", "/blocked");
        }
      } else {
        clearBlock();
        setInfo(null);
        setStatus("allowed");
      }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // Nếu phiên trước đã bị khóa → chặn ngay, không chờ mạng.
    const cached = readBlock();
    if (cached?.blocked) {
      setInfo(cached);
      setStatus("blocked");
    }
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    // Chỉ poll khi tab đang hiển thị → giảm request thừa / egress.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);

    let channel: any = null;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
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
              reason: payload?.new?.reason ?? null,
              message: "Tài khoản của bạn vừa bị khóa bởi Ban quản trị.",
            });
          },
        )
        .subscribe();
    })();

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [check]);

  // Chặn điều hướng thủ công (back/forward, sửa URL) khi đang bị khóa.
  useEffect(() => {
    if (status !== "blocked") return;
    const pin = () => {
      if (!window.location.pathname.startsWith("/blocked")) {
        window.history.replaceState(null, "", "/blocked");
      }
    };
    pin();
    window.addEventListener("popstate", pin);
    return () => window.removeEventListener("popstate", pin);
  }, [status]);

  if (status === "blocked") return <BlockedScreen info={info} />;
  if (status === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-rose-400" />
      </main>
    );
  }
  return <>{children}</>;
}
