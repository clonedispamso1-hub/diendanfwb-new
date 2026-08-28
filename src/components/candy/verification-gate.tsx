/**
 * VerificationGate — nếu user hiện có 1 restriction 'verify_required' còn
 * hiệu lực → điều hướng sang /verify-required (không phải trang chủ).
 * Admin bypass. Fail-open nếu lỗi mạng để không khoá app.
 */
import { useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { isAdminPath } from "@/lib/admin-slug";

export function VerificationGate({ children }: { children: ReactNode }) {
  const check = useCallback(async () => {
    if (typeof window === "undefined") return;
    const p = window.location.pathname;
    // Admin Panel KHÔNG bao giờ bị điều hướng khỏi route hiện tại.
    if (isAdminPath(p)) return;
    if (p.startsWith("/verify-required") || p.startsWith("/auth") || p.startsWith("/maintenance")) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      // Admin bypass
      const { data: prof } = await (supabase as any)
        .from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
      if (prof?.is_admin) return;

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
    const on = () => void check();
    window.addEventListener("focus", on);
    return () => { window.removeEventListener("focus", on); };
  }, [check]);

  return <>{children}</>;
}
