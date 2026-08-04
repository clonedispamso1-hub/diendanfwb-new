import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import { AdminV3Shell } from "@/components/admin-v3/AdminV3Shell";
import { AuthProvider } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import {
  supabaseAdminSession,
  fetchCurrentBangchu,
  type BangchuRow,
} from "@/integrations/supabase/admin-client";
import { adminPath } from "@/lib/admin-slug";

function AdminPageInner() {
  const navigate = useNavigate();
  const [me, setMe] = useState<BangchuRow | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bc = await fetchCurrentBangchu();
      if (cancelled) return;
      if (!bc || bc.status !== "approved" || !bc.is_active) {
        navigate(adminPath("/login") ?? "/", { replace: true });
        return;
      }
      setMe(bc);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleLogout() {
    await supabaseAdminSession.auth.signOut();
    navigate(adminPath("/login") ?? "/", { replace: true });
  }

  if (!ready || !me) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Đang tải…</div>;
  }

  // ROLE-BASED SHELL: Admin 2 (Agent) chỉ thấy 4 tab vận hành.
  // Bang chủ (admin_1) và các role khác dùng AdminV1Shell đầy đủ.
  if (me.role === "admin_2") {
    return (
      <AdminV2Shell
        me={{
          username: me.username,
          role: me.role,
          avatar_url: (me as any).avatar_url ?? null,
          bangchu_id: me.id,
        }}
        onLogout={handleLogout}
        onBack={() => navigate("/")}
      />
    );
  }

  return (
    <AdminV3Shell
      me={{ username: me.username, role: me.role, avatar_url: (me as any).avatar_url ?? null }}
      onLogout={handleLogout}
      onBack={() => navigate("/")}
    />
  );
}

export default function AdminPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AdminPageInner />
      </NotificationProvider>
    </AuthProvider>
  );
}
