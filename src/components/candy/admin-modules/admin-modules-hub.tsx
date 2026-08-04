import { useState, useEffect } from "react";
import {
  Bot, Radio, ShieldAlert, Coins, Shield, BarChart3, Activity, ChevronLeft,
  Crown, ScrollText, Zap, LayoutDashboard, Users, Sparkles, MessageSquare,
  Gamepad2, EyeOff, Gauge, Brain, MapPinned, BadgeCheck, Phone,
} from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { usePendingReportsCount, formatBadge } from "@/hooks/use-pending-reports-count";
import { loadMyAdminPermissions, hasPerm, type AdminPermission } from "@/lib/admin-permissions";
import { BotControlCenter } from "./bot-control-center";
import { LiveSystemControl } from "./live-system-control";
import { ModerationCenter } from "./moderation-center";
import { FinancialPanel } from "./financial-panel";
import { SecurityCenter } from "./security-center";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { SystemHealth } from "./system-health";
import { AdminPermissionsManager } from "./admin-permissions-manager";
import { AuditLogsViewer } from "./audit-logs-viewer";
import { KeywordBotSwitches } from "./keyword-bot-switches";
import { DashboardOverview } from "./dashboard-overview";
import { UserManagement } from "./user-management";
import { BuffSystem } from "./buff-system";
import { EventGamification } from "./event-gamification";
import { ShadowSystem } from "./shadow-system";
import { RealtimeControl } from "./realtime-control";
import { AIRecommendation } from "./ai-recommendation";
import { SeedAccountsModule } from "./seed-accounts";
import { SeedChatControl } from "./seed-chat-control";
import VerificationCenter from "./verification-center";
import { KeywordManager } from "./keyword-manager";
import { PhoneVerifications } from "./phone-verifications";
import { DataManager } from "./data-manager";
import { VoiceLibraryManager } from "./voice-library-manager";

type ModuleDef = {
  key: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  perm: AdminPermission;
  Component: React.ComponentType;
  accent: string;
};

const MODULES: ModuleDef[] = [
  { key: "dashboard", title: "1. Dashboard Tổng quan", desc: "Realtime: user, doanh thu, report", icon: LayoutDashboard, perm: "super_admin", Component: DashboardOverview, accent: "#22d3ee" },
  { key: "users", title: "2. Quản lý User", desc: "Hồ sơ sâu + hành động nhanh", icon: Users, perm: "super_admin", Component: UserManagement, accent: "#60a5fa" },
  { key: "permissions", title: "3. Phân quyền Admin", desc: "Role, perms, suspend", icon: Crown, perm: "super_admin", Component: AdminPermissionsManager, accent: "#f472b6" },
  { key: "bots", title: "4. Hệ thống Bot", desc: "Bot AI, gán user làm bot", icon: Bot, perm: "bot_admin", Component: BotControlCenter, accent: "#a78bfa" },
  { key: "buff", title: "5. Buff Hệ thống", desc: "Like / follow / view / trending", icon: Sparkles, perm: "super_admin", Component: BuffSystem, accent: "#f472b6" },
  { key: "moderation", title: "6. Feed & Post Moderation", desc: "Duyệt bài, AI detect NSFW/spam", icon: ShieldAlert, perm: "moderation_admin", Component: ModerationCenter, accent: "#fbbf24" },
  { key: "chat-mod", title: "7. Chat Moderation", desc: "Theo dõi chat realtime, auto ban", icon: MessageSquare, perm: "moderation_admin", Component: KeywordBotSwitches, accent: "#deff9a" },
  { key: "live", title: "8. Live System & Reports", desc: "Live room, kick, mute, queue report", icon: Radio, perm: "live_admin", Component: LiveSystemControl, accent: "#f87171" },
  { key: "security", title: "9. Anti-Fake / Anti-Spam", desc: "Multi-acc, VPN, device fingerprint", icon: Shield, perm: "security_admin", Component: SecurityCenter, accent: "#60a5fa" },
  { key: "finance", title: "10. Tài chính Gem / Premium", desc: "Nạp, chuyển, rollback, whale", icon: Coins, perm: "finance_admin", Component: FinancialPanel, accent: "#34d399" },
  { key: "event", title: "11. Event & Gamification", desc: "Vòng quay, nhiệm vụ, leaderboard", icon: Gamepad2, perm: "super_admin", Component: EventGamification, accent: "#fbbf24" },
  { key: "shadow", title: "12. Shadow System", desc: "Shadowban ngầm vi phạm", icon: EyeOff, perm: "moderation_admin", Component: ShadowSystem, accent: "#94a3b8" },
  { key: "audit", title: "13. Audit Logs", desc: "Lịch sử hành động admin/mod", icon: ScrollText, perm: "super_admin", Component: AuditLogsViewer, accent: "#94a3b8" },
  { key: "realtime", title: "14. Realtime Control Center", desc: "Tải hệ thống, attack detection", icon: Gauge, perm: "super_admin", Component: RealtimeControl, accent: "#22d3ee" },
  { key: "ai-reco", title: "15. AI Recommendation", desc: "Explore, matching, premium boost", icon: Brain, perm: "super_admin", Component: AIRecommendation, accent: "#a78bfa" },
  { key: "fwb-nearby", title: "16. FWB Nearby (Seed)", desc: "Bật seed account · adapt theo viewer", icon: MapPinned, perm: "super_admin", Component: SeedAccountsModule, accent: "#ec4899" },
  { key: "seed-chat", title: "✨ Seed Chat Control", desc: "Admin rep realtime hộ nick ảo", icon: MessageSquare, perm: "super_admin", Component: SeedChatControl, accent: "#f472b6" },
  { key: "verify", title: "🛡️ Duyệt xác thực hồ sơ", desc: "Phase 3.5 — selfie + chân dung", icon: BadgeCheck, perm: "moderation_admin", Component: VerificationCenter, accent: "#38bdf8" },
  { key: "phone-verify", title: "📱 Xác minh số điện thoại", desc: "Danh sách user đã cập nhật SĐT (Tìm Zalo)", icon: Phone, perm: "super_admin", Component: PhoneVerifications, accent: "#0ea5e9" },
  // Extra technical modules
  { key: "analytics", title: "+ Analytics", desc: "DAU, MAU, trending", icon: BarChart3, perm: "analytics_admin", Component: AnalyticsDashboard, accent: "#22d3ee" },
  { key: "health", title: "+ System Health", desc: "DB, realtime, auth", icon: Activity, perm: "super_admin", Component: SystemHealth, accent: "#f472b6" },
  { key: "keywords", title: "+ Keyword & Bot Switches", desc: "Từ khoá cấm + bật/tắt Bot", icon: Zap, perm: "bot_admin", Component: KeywordBotSwitches, accent: "#deff9a" },
  { key: "keyword-manager", title: "🚫 Bot Từ khoá (CRUD + Log)", desc: "Quản lý từ khoá cấm + log vi phạm", icon: ShieldAlert, perm: "moderation_admin", Component: KeywordManager, accent: "#ef4444" },
  { key: "data-manager", title: "💾 Backup / Restore / Reset", desc: "Export mã hoá, Import, Factory Reset dữ liệu", icon: ScrollText, perm: "super_admin", Component: DataManager, accent: "#f59e0b" },
  { key: "voice-library", title: "🎙️ Thư viện Voice", desc: "Upload / xoá voice cho nick clone gửi", icon: MessageSquare, perm: "super_admin", Component: VoiceLibraryManager, accent: "#8b5cf6" },
];

export function AdminModulesHub() {
  const { me, isAdmin } = useAuth();
  const pendingReports = usePendingReportsCount();
  const [perms, setPerms] = useState<Set<AdminPermission> | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMyAdminPermissions(isAdmin === true).then((p) => { if (!cancelled) setPerms(p); });
    return () => { cancelled = true; };
  }, [isAdmin, me?.id]);

  if (perms == null) return <div className="adm-empty">Đang tải quyền…</div>;

  const visible = MODULES.filter((m) => hasPerm(perms, m.perm));

  if (visible.length === 0) {
    return <div className="adm-empty">Bạn không có quyền truy cập module mở rộng.</div>;
  }

  if (active) {
    const mod = visible.find((m) => m.key === active);
    if (!mod) { setActive(null); return null; }
    const Comp = mod.Component;
    return (
      <div className="adm-modules-wrap">
        <div className="adm-sticky-nav">
          <button className="icon-button" onClick={() => setActive(null)} aria-label="Quay lại">
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{mod.title}</div>
        </div>
        <Comp />
      </div>
    );
  }

  return (
    <div className="adm-modules-wrap">
      <div className="adm-modules-grid">
        {visible.map((m) => {
          const Icon = m.icon;
          const badge = m.key === "moderation" ? formatBadge(pendingReports) : "";
          return (
            <button
              key={m.key}
              className="adm-module-card"
              onClick={() => setActive(m.key)}
              style={{ ["--accent" as any]: m.accent, position: "relative" }}
            >
              <div className="adm-module-card-icon">
                <Icon size={20} />
              </div>
              <div className="adm-module-card-text">
                <div className="adm-module-card-title">{m.title}</div>
                <div className="adm-module-card-desc">{m.desc}</div>
              </div>
              {badge && (
                <span style={{
                  position: "absolute", top: 8, right: 8,
                  minWidth: 22, height: 22, padding: "0 7px",
                  borderRadius: 999, background: "#ef4444", color: "white",
                  fontSize: 12, fontWeight: 800, display: "inline-flex",
                  alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="adm-perm-summary">
        Quyền của bạn: {Array.from(perms).map((p) => <span key={p} className="adm-tag">{p}</span>)}
      </div>
    </div>
  );
}
