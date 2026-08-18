/**
 * AccessGate — cổng chặn Ban Level 3.
 *
 * Nguyên tắc:
 * - Chặn theo DANH TÍNH do backend (RPC security_gate) xác định: tài khoản hiện tại
 *   ban_level >= 3, hoặc thiết bị/cookie đã được SQL Level 3 gắn. KHÔNG chặn theo IP/Wi-Fi.
 * - Kiểm tra TRƯỚC khi render bất kỳ giao diện nào: app boot, restore session, login,
 *   đổi route (dùng cache ngắn nên không phát sinh request thừa).
 * - Không polling, không realtime.
 * - Fail-open: lỗi mạng/RPC → cho dùng bình thường (không khóa oan).
 * - Không signOut khi bị chặn: giữ danh tính để lần refresh sau vẫn nhận diện đúng.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  securityGate,
  invalidateGateCache,
  clearBlock,
  currentGateUid,
  isBlockedRoute,
  isDeviceBlockedSticky,
  markDeviceBlocked,
  type GateResult,
} from "@/lib/access-guard";
import { watchBanRealtime } from "@/lib/ban-realtime";
import { BlockedScreen } from "@/components/candy/blocked-screen";


type Status = "checking" | "open" | "blocked";

export function AccessGate({ children }: { children: ReactNode }) {
  const seq = useRef(0);
  const lastUid = useRef<string | null | undefined>(undefined);
  const mounted = useRef(true);
  const [status, setStatus] = useState<Status>(() =>
    isDeviceBlockedSticky() ? "blocked" : "checking",
  );
  const [info, setInfo] = useState<GateResult | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const check = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    // Trang /blocked tự lo phần kiểm tra của nó — gate không được can thiệp.
    if (isBlockedRoute()) return;
    // Mỗi lần kiểm tra có số thứ tự riêng; kết quả cũ bị bỏ qua hoàn toàn.
    const my = ++seq.current;
    const uidAtStart = await currentGateUid();
    try {
      const gate = await securityGate(force);
      const uidNow = await currentGateUid();
      // Kết quả lỗi thời (đã có lần kiểm tra mới) hoặc thuộc uid khác → bỏ.
      if (!mounted.current || my !== seq.current || uidNow !== uidAtStart) return;
      if (gate.blocked && !gate.admin) {
        if (gate.scope === "device" || gate.scope === "cookie") markDeviceBlocked();
        setInfo(gate);
        setStatus("blocked");
      } else {
        setInfo(null);
        setStatus("open");
      }
    } catch {
      if (!mounted.current || my !== seq.current) return;
      setStatus("open");
    }
  }, []);

  // Boot + mỗi lần đổi route (cache ngắn → hầu như không thêm request).
  useEffect(() => {
    clearBlock();
    void check();
  }, [check, pathname]);

  // Login / restore session / đổi tài khoản → kiểm tra lại ngay với dữ liệu mới.
  //
  // QUAN TRỌNG: TOKEN_REFRESHED / INITIAL_SESSION còn phát sinh khi tab được
  // focus trở lại. Nếu lúc đó đặt status = "checking" thì toàn bộ cây con bị
  // unmount → app remount → Admin Panel bị đưa về trang chủ. Vì vậy chỉ
  // "checking" (che UI) khi danh tính thực sự đổi (đăng nhập / đăng xuất);
  // các event khác chỉ kiểm tra âm thầm, giữ nguyên route đang mở.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      const identityChanged = uid !== lastUid.current;
      lastUid.current = uid;

      const hard =
        (event === "SIGNED_OUT") ||
        (event === "SIGNED_IN" && identityChanged) ||
        (event === "USER_UPDATED" && identityChanged);

      if (!hard && event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION") return;

      // Huỷ mọi kết quả đang bay + xoá cache trước khi kiểm tra lại.
      seq.current++;
      invalidateGateCache();
      if (hard) setStatus("checking");
      void check(true);
    });
    return () => data.subscription.unsubscribe();
  }, [check]);
  // Realtime: Admin đổi ban_level ở máy khác → thiết bị này bị đẩy ra ngay lập tức.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const uid = await currentGateUid();
      if (cancelled || uid === "anon") return;
      stop = watchBanRealtime(uid);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
      stop?.();
      stop = uid ? watchBanRealtime(uid) : null;
    });
    return () => {
      cancelled = true;
      stop?.();
      data.subscription.unsubscribe();
    };
  }, []);


  // Quay lại trang bằng nút Back (bfcache) hoặc chuyển tab về:
  // kiểm tra lại. bfcache → force (bỏ cache) vì trang được khôi phục nguyên trạng;
  // đổi tab → dùng cache 30s nên hầu như không phát sinh request.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      invalidateGateCache();
      void check(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Block Level 3 → điều hướng cứng sang /blocked (replace, không push).
  // Mọi route khác (kể cả nhập trực tiếp URL / F5) đều bị đưa về /blocked.
  useEffect(() => {
    if (status !== "blocked") return;
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/blocked") {
      window.location.replace("/blocked");
    }
  }, [status, pathname]);

  // Khi bị chặn: chỉ render màn hình /blocked, không render bất kỳ layout nào
  // (không Navbar, Dock, Header, Footer, Notification, Chat, preload feed...).
  if (status === "blocked") return <BlockedScreen info={info} />;
  // Chưa có kết luận → không render website dù chỉ 1 frame.
  if (status === "checking") return null;
  return <>{children}</>;
}

