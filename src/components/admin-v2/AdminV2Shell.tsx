import { avatarSrc } from "@/lib/image-cdn";
import { useState, type ReactNode } from "react";
import {
  MessageCircle, Flag, Users, ClipboardList,
  LogOut, LayoutDashboard, Menu, X, ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { SeedChatControl } from "@/components/candy/admin-modules/seed-chat-control";
import { ModerationCenter } from "@/components/candy/admin-modules/moderation-center";
import { MemberSupportDirectory } from "./MemberSupportDirectory";
import { AgentDailyReportForm } from "./AgentDailyReportForm";
import { usePendingReportsCount, formatBadge } from "@/hooks/use-pending-reports-count";
import "@/styles/admin-modules.css";

export type AdminV2Me = {
  username: string;
  role: string;
  avatar_url?: string | null;
  bangchu_id?: string | null;
};

type TabKey = "inbox" | "moderation" | "members" | "report";

const TABS: { key: TabKey; label: string; icon: any; desc: string }[] = [
  { key: "inbox",      label: "Hộp thư Nick Ảo",     icon: MessageCircle, desc: "Chat tập trung từ user → seed account" },
  { key: "moderation", label: "Kiểm duyệt & Báo cáo", icon: Flag,          desc: "Hàng đợi tố cáo chờ xử lý" },
  { key: "members",    label: "Hỗ trợ Thành viên",   icon: Users,         desc: "Tra cứu thông tin user (read-only)" },
  { key: "report",     label: "Báo cáo Tiến độ",     icon: ClipboardList, desc: "Nhật ký công việc hằng ngày" },
];

function ReportDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 18, height: 18, padding: "0 5px", marginLeft: 6,
        borderRadius: 999, background: "#ef4444", color: "#fff",
        fontSize: "0.7rem", fontWeight: 800, lineHeight: 1,
      }}
    >
      {formatBadge(count)}
    </span>
  );
}

export function AdminV2Shell({
  me, onLogout, onBack,
}: {
  me: AdminV2Me;
  onLogout: () => void;
  onBack?: () => void;
}) {
  const [active, setActive] = useState<TabKey>("inbox");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pending = usePendingReportsCount();

  const go = (k: TabKey) => { setActive(k); setSidebarOpen(false); };

  return (
    <div className="adm2-root">
      {/* TOPBAR */}
      <header className="adm2-topbar">
        <div className="adm2-topbar-inner">
          <button
            className="adm2-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={22} />
          </button>

          <div className="adm2-brand">
            <LayoutDashboard size={18} />
            <span>Agent Panel</span>
            <span className="adm2-role-pill">Admin 2</span>
          </div>

          <nav className="adm2-nav">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`adm2-nav-item ${active === t.key ? "is-active" : ""}`}
                onClick={() => go(t.key)}
              >
                <t.icon size={15} />
                <span>{t.label}</span>
                {t.key === "moderation" ? <ReportDot count={pending} /> : null}
              </button>
            ))}
          </nav>

          <div className="adm2-userbox">
            <div className="adm2-avatar">
              {me.avatar_url ? <img loading="lazy" decoding="async" src={avatarSrc(me.avatar_url, 64)} alt={me.username} /> : <span>{me.username?.[0]?.toUpperCase() || "A"}</span>}
            </div>
            <div className="adm2-userinfo">
              <div className="adm2-username">{me.username}</div>
              <div className="adm2-userrole">{me.role}</div>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Trở lại website"
                title="Trở lại website"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 10,
                  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                  color: "#1a1208", fontWeight: 800, fontSize: ".78rem",
                  border: "1px solid rgba(251,191,36,0.6)", cursor: "pointer",
                  boxShadow: "0 0 14px rgba(251,191,36,0.45), 0 0 28px rgba(251,191,36,0.25)",
                  whiteSpace: "nowrap",
                }}
              >
                <ExternalLink size={14} />
                <span>Trở lại website</span>
              </button>
            )}
            <button className="adm2-icon-btn" onClick={onLogout} aria-label="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE SIDEBAR */}
      {sidebarOpen && (
        <>
          <div className="adm2-backdrop" onClick={() => setSidebarOpen(false)} />
          <aside className="adm2-sidebar">
            <div className="adm2-sidebar-head">
              <div className="adm2-avatar adm2-avatar-lg">
                {me.avatar_url ? <img loading="lazy" decoding="async" src={avatarSrc(me.avatar_url, 64)} alt={me.username} /> : <span>{me.username?.[0]?.toUpperCase() || "A"}</span>}
              </div>
              <div>
                <div className="adm2-username">{me.username}</div>
                <div className="adm2-userrole">{me.role}</div>
              </div>
              <button className="adm2-icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <nav className="adm2-sidebar-nav">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`adm2-side-item ${active === t.key ? "is-active" : ""}`}
                  onClick={() => go(t.key)}
                >
                  <t.icon size={18} />
                  <div style={{ display: "grid", gap: 2 }}>
                    <span>{t.label}</span>
                    <span style={{ fontSize: ".7rem", opacity: 0.6 }}>{t.desc}</span>
                  </div>
                  {t.key === "moderation" ? <ReportDot count={pending} /> : null}
                </button>
              ))}
              <div className="adm2-side-divider" />
              <button className="adm2-side-item adm2-side-danger" onClick={onLogout}>
                <LogOut size={18} /> Đăng Xuất
              </button>
            </nav>
          </aside>
        </>
      )}

      {/* MAIN */}
      <main className="adm2-main">
        <PageHeader
          icon={TABS.find((t) => t.key === active)?.icon ?? ShieldCheck}
          title={TABS.find((t) => t.key === active)?.label ?? ""}
          subtitle={TABS.find((t) => t.key === active)?.desc}
        />
        <div className="adm2-content">
          {active === "inbox"      && <SeedChatControl />}
          {active === "moderation" && <ModerationCenter />}
          {active === "members"    && <MemberSupportDirectory />}
          {active === "report"     && <AgentDailyReportForm bangchuId={me.bangchu_id ?? null} />}
        </div>
      </main>

      <AdminV2Styles />
    </div>
  );
}

function PageHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="adm2-pageheader">
      <div className="adm2-pageheader-icon"><Icon size={20} /></div>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

function AdminV2Styles(): ReactNode {
  return (
    <style>{`
:root {
  --adm2-bg: #0a0d11;
  --adm2-surface: #121620;
  --adm2-surface-2: #1a1f2c;
  --adm2-border: rgba(222,255,154,0.12);
  --adm2-border-strong: rgba(222,255,154,0.35);
  --adm2-text: #e8ecf3;
  --adm2-text-dim: #98a2b3;
  --adm2-accent: #deff9a;
  --adm2-accent-2: #34d399;
  --adm2-glow: 0 0 14px rgba(222,255,154,0.45);
}
.adm2-root { min-height: 100vh; background: var(--adm2-bg); color: var(--adm2-text); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.adm2-topbar { position: sticky; top: 0; z-index: 30; background: linear-gradient(180deg,#0e121a 0%,#0a0d11 100%); border-bottom: 1px solid var(--adm2-border); }
.adm2-topbar-inner { max-width: 1500px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 12px; }
.adm2-hamburger { display: none; background: transparent; color: var(--adm2-text); border: 1px solid var(--adm2-border); border-radius: 10px; padding: 8px; cursor: pointer; }
.adm2-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--adm2-text); font-weight: 800; font-size: .95rem; }
.adm2-role-pill { padding: 3px 8px; border-radius: 999px; background: rgba(222,255,154,0.15); color: var(--adm2-accent); border: 1px solid rgba(222,255,154,0.35); font-size: .65rem; text-transform: uppercase; letter-spacing: .06em; }
.adm2-nav { display: flex; gap: 4px; flex: 1; margin-left: 8px; overflow-x: auto; }
.adm2-nav::-webkit-scrollbar { display: none; }
.adm2-nav-item { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; background: transparent; color: var(--adm2-text-dim); border: 1px solid transparent; font-size: .82rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all .15s; }
.adm2-nav-item:hover { color: var(--adm2-text); background: rgba(255,255,255,0.04); }
.adm2-nav-item.is-active { color: #0a0d11; background: var(--adm2-accent); border-color: var(--adm2-accent); box-shadow: var(--adm2-glow); }
.adm2-userbox { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--adm2-border); }
.adm2-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: linear-gradient(135deg, var(--adm2-accent), var(--adm2-accent-2)); color: #0a0d11; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: .85rem; }
.adm2-avatar img { width: 100%; height: 100%; object-fit: cover; }
.adm2-avatar-lg { width: 44px; height: 44px; font-size: 1.05rem; }
.adm2-userinfo { line-height: 1.2; }
.adm2-username { font-size: .82rem; font-weight: 700; }
.adm2-userrole { font-size: .68rem; color: var(--adm2-text-dim); text-transform: uppercase; letter-spacing: .04em; }
.adm2-icon-btn { background: transparent; border: 1px solid var(--adm2-border); color: var(--adm2-text-dim); padding: 6px; border-radius: 8px; cursor: pointer; display: inline-flex; }
.adm2-icon-btn:hover { color: #fff; border-color: var(--adm2-border-strong); }

.adm2-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; }
.adm2-sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: var(--adm2-surface); border-right: 1px solid var(--adm2-border); z-index: 50; display: flex; flex-direction: column; }
.adm2-sidebar-head { display: flex; align-items: center; gap: 10px; padding: 14px; border-bottom: 1px solid var(--adm2-border); }
.adm2-sidebar-nav { display: flex; flex-direction: column; gap: 4px; padding: 12px; overflow-y: auto; }
.adm2-side-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: transparent; border: 1px solid transparent; color: var(--adm2-text); font-size: .85rem; font-weight: 600; cursor: pointer; text-align: left; }
.adm2-side-item:hover { background: rgba(255,255,255,0.04); }
.adm2-side-item.is-active { background: rgba(222,255,154,0.12); border-color: var(--adm2-border-strong); color: var(--adm2-accent); }
.adm2-side-divider { height: 1px; background: var(--adm2-border); margin: 8px 0; }
.adm2-side-danger { color: #fca5a5; }

.adm2-main { max-width: 1500px; margin: 0 auto; padding: 20px 16px 48px; }
.adm2-pageheader { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding: 14px 16px; background: var(--adm2-surface); border: 1px solid var(--adm2-border); border-radius: 14px; }
.adm2-pageheader-icon { width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: rgba(222,255,154,0.12); color: var(--adm2-accent); border: 1px solid var(--adm2-border-strong); }
.adm2-pageheader h1 { margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--adm2-accent); text-shadow: 0 0 8px rgba(222,255,154,0.4); }
.adm2-pageheader p { margin: 2px 0 0; font-size: .8rem; color: var(--adm2-text-dim); }

.adm2-content { display: block; }

@media (max-width: 900px) {
  .adm2-hamburger { display: inline-flex; }
  .adm2-nav { display: none; }
  .adm2-userinfo { display: none; }
}
    `}</style>
  );
}
