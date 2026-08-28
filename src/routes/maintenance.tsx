import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Facebook, MessageCircle, Wrench, Loader2 } from "lucide-react";
import {
  getMaintenance,
  MAINTENANCE_DEFAULT,
  type MaintenanceSettings,
} from "@/lib/popup-api";
import { supabase } from "@/lib/supabase";
import { supabaseAdminSession } from "@/integrations/supabase/admin-client";
import { adminPath } from "@/lib/admin-slug";

async function isApprovedAdmin() {
  try {
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
  } catch {
    // ignore
  }
  return false;
}

function maintenanceAdminTarget() {
  const base = adminPath() ?? "/admin";
  return `${base}?section=notifications&tab=maintenance`;
}

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Đang bảo trì — Diễn Đàn FWB" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Website đang được bảo trì, vui lòng quay lại sau.",
      },
      { property: "og:title", content: "Đang bảo trì — Diễn Đàn FWB" },
      { property: "og:description", content: "Website đang được bảo trì, vui lòng quay lại sau." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const [m, setM] = useState<MaintenanceSettings>(MAINTENANCE_DEFAULT);
  const [adminState, setAdminState] = useState<"checking" | "admin" | "user">("checking");

  useEffect(() => {
    let cancelled = false;
    void isApprovedAdmin().then((admin) => {
      if (cancelled) return;
      if (admin) {
        setAdminState("admin");
        if (typeof window !== "undefined") {
          window.location.replace(maintenanceAdminTarget());
        }
      } else {
        setAdminState("user");
      }
    });
    getMaintenance().then(setM).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (adminState === "checking" || adminState === "admin") {
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(150deg,#0b1220 0%,#152449 50%,#1e3a8a 100%)",
        color: "#f8fafc", fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Loader2 size={36} className="animate-spin" />
          <div style={{ fontSize: 15, opacity: .85 }}>
            {adminState === "admin"
              ? "Đang chuyển đến Admin Panel…"
              : "Đang kiểm tra phiên đăng nhập…"}
          </div>
          {adminState === "admin" && (
            <a
              href={maintenanceAdminTarget()}
              style={{
                marginTop: 6, padding: "10px 18px", borderRadius: 999,
                background: "linear-gradient(135deg,#e0f2fe,#bae6fd)",
                color: "#0b1220", fontWeight: 700, textDecoration: "none", fontSize: 14,
              }}
            >
              ← Quay lại Admin Panel
            </a>
          )}
        </div>
      </div>
    );
  }


  const color = m.text_color || "#f8fafc";

  return (
    <div className="mt-wrap">
      <div className="mt-orb mt-orb-a" />
      <div className="mt-orb mt-orb-b" />

      <div className="mt-card" style={{ color }}>
        <div className="mt-icon">
          <Wrench size={34} strokeWidth={2.2} />
        </div>

        {m.image_url && (
          <div className="mt-media">
            <img loading="lazy" decoding="async" src={m.image_url} alt={m.title} />
          </div>
        )}

        <h1
          className="mt-title"
          style={{ fontSize: Math.round(m.font_size * 1.9), color }}
        >
          {m.title}
        </h1>
        <p className="mt-desc" style={{ fontSize: m.font_size, color }}>
          {m.description}
        </p>

        <div className="mt-bar">
          <span />
        </div>

        <div className="mt-actions">
          {m.contact_url && (
            <a
              className="mt-cta"
              href={m.contact_url}
              rel="noopener noreferrer"
            >
              {m.contact_text || "Liên hệ Admin"}
            </a>
          )}
          {m.facebook && (
            <a
              className="mt-link"
              href={m.facebook}
              rel="noopener noreferrer"
              style={{ color }}
            >
              <Facebook size={16} /> Facebook
            </a>
          )}
          {m.zalo && (
            <a
              className="mt-link"
              href={m.zalo}
              rel="noopener noreferrer"
              style={{ color }}
            >
              <MessageCircle size={16} /> Zalo
            </a>
          )}
        </div>
      </div>

      <style>{`
        .mt-wrap{position:relative;min-height:100vh;display:grid;place-items:center;padding:24px;
          overflow:hidden;background:linear-gradient(150deg,#0b1220 0%,#152449 50%,#1e3a8a 100%)}
        .mt-orb{position:absolute;border-radius:999px;filter:blur(70px);opacity:.55}
        .mt-orb-a{width:420px;height:420px;background:#2563eb;top:-120px;left:-90px;
          animation:mt-drift 14s ease-in-out infinite}
        .mt-orb-b{width:360px;height:360px;background:#0ea5e9;bottom:-110px;right:-80px;
          animation:mt-drift 18s ease-in-out infinite reverse}
        .mt-card{position:relative;z-index:2;width:100%;max-width:520px;text-align:center;
          padding:40px 28px 32px;border-radius:28px;
          background:linear-gradient(160deg,#1e293b 0%,#243b6b 100%);
          border:1px solid rgba(148,197,255,.28);
          box-shadow:0 40px 90px -30px rgba(2,6,23,.9);
          animation:mt-in .55s cubic-bezier(.22,1,.36,1) both}
        .mt-icon{width:76px;height:76px;margin:0 auto 20px;border-radius:24px;display:grid;
          place-items:center;color:#fff;background:linear-gradient(135deg,#3b82f6,#06b6d4);
          box-shadow:0 16px 34px rgba(37,99,235,.45);animation:mt-spin 4s ease-in-out infinite}
        .mt-media{margin:0 0 20px;border-radius:18px;overflow:hidden;
          border:1px solid rgba(148,197,255,.25)}
        .mt-media img{display:block;width:100%;max-height:230px;object-fit:cover}
        .mt-title{margin:0 0 12px;font-weight:800;line-height:1.22}
        .mt-desc{margin:0;line-height:1.65;opacity:.9;white-space:pre-wrap}
        .mt-bar{margin:26px auto 24px;width:190px;height:6px;border-radius:999px;
          background:rgba(255,255,255,.16);overflow:hidden}
        .mt-bar span{display:block;width:45%;height:100%;border-radius:999px;
          background:linear-gradient(90deg,#38bdf8,#818cf8);animation:mt-slide 1.9s ease-in-out infinite}
        .mt-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
        .mt-cta{padding:12px 26px;border-radius:999px;font-weight:800;font-size:15px;
          text-decoration:none;color:#0b1220;background:linear-gradient(135deg,#e0f2fe,#bae6fd);
          box-shadow:0 14px 28px rgba(14,165,233,.35);transition:transform .18s ease}
        .mt-cta:hover{transform:translateY(-2px) scale(1.03)}
        .mt-link{display:inline-flex;align-items:center;gap:6px;padding:11px 18px;border-radius:999px;
          font-size:14px;font-weight:600;text-decoration:none;
          border:1px solid rgba(148,197,255,.35);background:rgba(255,255,255,.08);
          transition:background .18s ease}
        .mt-link:hover{background:rgba(255,255,255,.18)}
        @keyframes mt-in{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
        @keyframes mt-spin{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg)}}
        @keyframes mt-slide{0%{transform:translateX(-110%)}100%{transform:translateX(230%)}}
        @keyframes mt-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(40px,30px)}}
        @media (max-width:480px){.mt-card{padding:32px 20px 26px;border-radius:22px}}
      `}</style>
    </div>
  );
}
