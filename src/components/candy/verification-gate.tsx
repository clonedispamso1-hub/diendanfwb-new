/**
 * VerificationGate — nếu user hiện có 1 restriction 'verify_required' còn
 * hiệu lực → điều hướng sang /verify-required (không phải trang chủ).
 * Admin bypass. Fail-open nếu lỗi mạng để không khoá app.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { isAdminPath } from "@/lib/admin-slug";
import { securityGate } from "@/lib/access-guard";

export function VerificationGate({ children }: { children: ReactNode }) {
  const lastRunRef = useRef(0);
  const check = useCallback(async (throttle = false) => {
    if (typeof window === "undefined") return;
    const p = window.location.pathname;
    // Admin Panel KHÔNG bao giờ bị điều hướng khỏi route hiện tại.
    if (isAdminPath(p)) return;
    if (p.startsWith("/verify-required") || p.startsWith("/auth") || p.startsWith("/maintenance")) return;
    // Focus lại cửa sổ: tối đa 1 lần kiểm tra mỗi 60s.
    if (throttle && Date.now() - lastRunRef.current < 60_000) return;
    lastRunRef.current = Date.now();
    try {
      // Chỉ cần uid → đọc phiên local (không gọi /auth/v1/user). Quyền vẫn do RLS kiểm.
      const { data: sess } = await supabase.auth.getSession();
      const auth = { user: sess?.session?.user ?? null };
      if (!auth.user) return;

      // Admin bypass — dùng lại kết quả securityGate đã cache theo uid (5 phút,
      // tự xoá khi đổi tài khoản/đăng xuất) thay vì query profiles riêng mỗi lần focus.
      const gate = await securityGate(false);
      if (gate.admin === true) return;

      const { data } = await (supabase as any)
        .from("user_restrictions")
        // Schema hiện tại KHÔNG có cột revoked_at (gỡ hạn chế = xoá dòng).
        .select("id, expires_at")
        .eq("user_id", auth.user.id)
        .eq("kind", "verify_required")
        .limit(1);
      const active = (data ?? []).some((r: any) =>
        !r.expires_at || new Date(r.expires_at).getTime() > Date.now());
      if (active) window.location.replace("/verify-required");
    } catch { /* fail-open */ }
  }, []);

  useEffect(() => {
    void check();
    const on = () => void check(true);
    window.addEventListener("focus", on);
    return () => { window.removeEventListener("focus", on); };
  }, [check]);

  return <>{children}</>;
}
