/**
 * AccessGate — cổng chặn CỨNG toàn bộ website (Block Level 3).
 * - Chạy security_gate() TRƯỚC khi render bất kỳ route nào.
 * - Khi blocked: KHÔNG render children ở bất kỳ URL nào (Home, Login, Register,
 *   quên mật khẩu, admin…) → luôn hiển thị màn 403 và ép URL về /blocked.
 * - Chặn Back / Forward / sửa URL / pushState: luôn quay lại /blocked.
 * - Xoá sạch session, access token, refresh token và dữ liệu đăng nhập.
 * - Fail-closed: lỗi mạng / RPC lỗi → coi như bị khóa (xem access-guard.ts).
 * - Chỉ Admin (gate.admin === true) mới được bỏ qua.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  securityGate,
  forceLogout,
  clearBlock,
  rememberBlock,
  readBlock,
  BLOCK_STORAGE_KEY,
  type GateResult,
} from "@/lib/access-guard";
import { BlockedScreen } from "@/components/candy/blocked-screen";

const POLL_MS = 60_000;

/** Xoá toàn bộ dấu vết đăng nhập trên trình duyệt (access/refresh token, cache). */
async function purgeSession() {
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  try {
    const keep = localStorage.getItem(BLOCK_STORAGE_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key === BLOCK_STORAGE_KEY) continue;
      if (/^sb-|supabase|auth|token|session|fwb_/i.test(key)) localStorage.removeItem(key);
    }
    if (keep) localStorage.setItem(BLOCK_STORAGE_KEY, keep);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export function AccessGate({ children }: { children: ReactNode }) {
  const busy = useRef(false);
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");
  const [info, setInfo] = useState<GateResult | null>(null);

  const check = useCallback(async () => {
    if (typeof window === "undefined" || busy.current) return;
    busy.current = true;
    try {
      const gate = await securityGate();
      if (gate.blocked && !gate.admin) {
        rememberBlock(gate);
        setInfo(gate);
        setStatus("blocked");
        await purgeSession();
        if (!window.location.pathname.startsWith("/blocked")) {
          // replace() -> tải lại từ request đầu tiên tại /blocked, không route nào render.
          window.location.replace("/blocked");
        }
      } else {
        clearBlock();
        setInfo(null);
        // Ở /blocked thì giữ nguyên màn khóa (trang tĩnh), không render app.
        setStatus(window.location.pathname.startsWith("/blocked") ? "blocked" : "allowed");
      }

    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // Đang ở /blocked → luôn hiển thị màn khóa, không render route nào khác.
    if (window.location.pathname.startsWith("/blocked")) setStatus("blocked");
    // Nếu phiên trước đã bị khóa (localStorage hoặc cookie) → chặn ngay, không chờ mạng.
    const cached = readBlock();
    if (cached?.blocked) {

      setInfo(cached);
      setStatus("blocked");
      void purgeSession();
      if (!window.location.pathname.startsWith("/blocked")) {
        window.location.replace("/blocked");
      }
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
              level: 3,
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

  // Ghim URL về /blocked: chặn back/forward, sửa URL, pushState của router.
  useEffect(() => {
    if (status !== "blocked") return;
    const pin = () => {
      if (!window.location.pathname.startsWith("/blocked")) {
        window.history.replaceState(null, "", "/blocked");
      }
    };
    pin();

    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (...args: any[]) {
      origPush.apply(window.history, args as any);
      pin();
    } as typeof window.history.pushState;
    window.history.replaceState = function (...args: any[]) {
      origReplace.apply(window.history, args as any);
      if (!window.location.pathname.startsWith("/blocked")) {
        origReplace.call(window.history, null, "", "/blocked");
      }
    } as typeof window.history.replaceState;

    window.addEventListener("popstate", pin);
    window.addEventListener("hashchange", pin);
    const guard = window.setInterval(pin, 500);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener("popstate", pin);
      window.removeEventListener("hashchange", pin);
      window.clearInterval(guard);
    };
  }, [status]);

  if (status === "blocked") return <BlockedScreen info={info} />;
  if (status === "checking") return <div className="min-h-screen bg-white" />;
  return <>{children}</>;
}
