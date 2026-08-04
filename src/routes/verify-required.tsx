import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, MessageCircle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContactUrl } from "@/lib/use-admin-contact";

export const Route = createFileRoute("/verify-required")({
  head: () => ({
    meta: [
      { title: "Tài khoản cần xác minh" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyRequiredPage,
});

type VerifyCopy = { title?: string; description?: string; image?: string | null };

function VerifyRequiredPage() {
  const contactUrl = useAdminContactUrl();
  const [copy, setCopy] = useState<VerifyCopy>({
    title: "Tài khoản cần xác minh",
    description: "Tài khoản của bạn hiện cần được Admin xác minh trước khi sử dụng. Vui lòng liên hệ Admin để được hỗ trợ.",
    image: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("admin_site_settings").select("value").eq("key", "verify_required").maybeSingle();
        if (data?.value) setCopy((c) => ({ ...c, ...data.value }));
      } catch { /* keep defaults */ }
    })();
  }, []);

  const signOut = async () => {
    try { await supabase.auth.signOut(); } finally { window.location.replace("/auth"); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
      background: "linear-gradient(180deg,#0f1220 0%,#191d38 100%)", color: "#fff",
    }}>
      <div style={{
        maxWidth: 460, width: "100%", background: "#151933",
        border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 28, textAlign: "center",
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: "50%", margin: "0 auto 16px",
          background: "rgba(251,191,36,.15)", color: "#fbbf24",
          display: "grid", placeItems: "center",
        }}>
          <ShieldAlert size={32} />
        </div>
        {copy.image ? (
          <img loading="lazy" decoding="async" src={copy.image} alt="" style={{ maxWidth: "100%", borderRadius: 12, margin: "0 auto 16px" }} />
        ) : null}
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
          {copy.title || "Tài khoản cần xác minh"}
        </h1>
        <p style={{ color: "rgba(255,255,255,.75)", lineHeight: 1.55, marginBottom: 22 }}>
          {copy.description}
        </p>
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px",
            background: "#1877F2", color: "#fff", fontWeight: 700, borderRadius: 10,
            textDecoration: "none",
          }}
        >
          <MessageCircle size={16} /> Liên hệ Admin qua Facebook
        </a>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={signOut}
            style={{
              background: "transparent", border: "1px solid rgba(255,255,255,.15)",
              color: "rgba(255,255,255,.75)", padding: "8px 16px", borderRadius: 8,
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer",
            }}
          >
            <LogOut size={13} /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
