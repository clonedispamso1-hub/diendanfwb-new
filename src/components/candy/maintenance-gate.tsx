/**
 * MaintenanceGate — checks get_site_setting('maintenance'); if enabled AND the
 * current user is NOT admin, redirect to /maintenance. Admins pass through.
 */
import { useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { supabaseAdminSession } from "@/integrations/supabase/admin-client";
import { getMaintenance } from "@/lib/popup-api";
import { isAdminPath } from "@/lib/admin-slug";

async function isApprovedAdmin() {
  const { data: adminAuth } = await supabaseAdminSession.auth.getUser();
  if (adminAuth?.user) {
    const { data: bc } = await supabaseAdminSession
      .from("bangchu")
      .select("status,is_active")
      .eq("auth_user_id", adminAuth.user.id)
      .maybeSingle();

    if (bc && (bc as any).status === "approved" && (bc as any).is_active) return true;
  }

  const { data: userAuth } = await supabase.auth.getUser();
  if (userAuth?.user) {
    const { data: bc } = await supabase
      .from("bangchu")
      .select("status,is_active")
      .eq("auth_user_id", userAuth.user.id)
      .maybeSingle();

    if (bc && (bc as any).status === "approved" && (bc as any).is_active) return true;
  }

  return false;
}

/** V7: Maintenance Mode bị TẮT toàn cục — website luôn mở cho người dùng. */
const MAINTENANCE_DISABLED = true;

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const checkMaintenance = useCallback(async () => {
    if (MAINTENANCE_DISABLED) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/maintenance")) return;
    // Admin Panel: giữ nguyên route, không redirect.
    if (isAdminPath()) return;

    try {
      const maintenance = await getMaintenance();
      if (maintenance.enabled !== true) return;

      if (await isApprovedAdmin()) return;

      window.location.replace("/maintenance");
    } catch {
      // If check fails, do nothing (fail-open so we don't lock the app out).
    }
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;

    void checkMaintenance();

    const onRefresh = () => void checkMaintenance();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("maintenance-setting-changed", onRefresh);

    // Realtime plus focus events are sufficient; avoid continuous polling.
    const channel = supabase
      .channel("maintenance-gate-settings")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_site_settings",
          filter: "key=eq.maintenance",
        },
        onRefresh,
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("maintenance-setting-changed", onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [checkMaintenance]);

  return <>{children}</>;
}
