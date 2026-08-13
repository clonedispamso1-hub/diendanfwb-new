import { avatarSrc } from "@/lib/image-cdn";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FileText,
  Bell,
  Wallet,
  BarChart3,
  Settings,
  Globe,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  Search,
  TrendingUp,
  UserPlus,
  Activity,
  DollarSign,

  Flag,
} from "lucide-react";
import { HomePostsManager } from "@/components/admin-v1/HomePostsManager";
import { PendingPostsManager } from "@/components/admin-v3/PendingPostsManager";
import { Clock } from "lucide-react";
import { ReportsManagerV2 as ReportsManager } from "@/components/admin-v1/redesign/ReportsManagerV2";
import { GiftHistoryManager } from "@/components/admin-v1/GiftHistoryManager";
import { KeywordManager } from "@/components/candy/admin-modules/keyword-manager";
import { StatsDashboard } from "@/components/admin-v3/stats/StatsDashboard";
import { CrmManager } from "@/components/admin-v3/crm/CrmManager";
import { AdminMasterReviewPanel } from "@/components/admin-v1/AdminMasterReviewPanel";
import { usePendingReportsCount, formatBadge } from "@/hooks/use-pending-reports-count";
import { usePendingWithdrawals } from "@/hooks/use-pending-withdrawals";
import { formatNumber } from "@/lib/format";
import { MembersManager } from "@/components/admin-v3/members/MembersManager";
import { FwbPostsManager } from "@/components/admin-v3/fwb/FwbPostsManager";
import { ProfileManager } from "@/components/admin-v3/profile/ProfileManager";
import { GuidesManager } from "@/components/admin-v3/guides/GuidesManager";
import { CommunityVipManager } from "@/components/admin-v3/connect/CommunityVipManager";
import { LiveMocManager } from "@/components/admin-v3/live/LiveMocManager";
import { SecondAccountsManager } from "@/components/admin-v3/second-accounts/SecondAccountsManager";
import { PopupManager } from "@/components/admin-v3/notifications/PopupManager";
import { RequiredPopupManager } from "@/components/admin-v3/notifications/RequiredPopupManager";
import { GifLibraryManager } from "@/components/admin-v3/notifications/GifLibraryManager";
import { CoinTransfersManager } from "@/components/admin-v3/wallet/CoinTransfersManager";
import { SecretConnectManager } from "@/components/admin-v3/secret-connect/SecretConnectManager";
import { WithdrawalRequestsManager } from "@/components/admin-v3/wallet/WithdrawalRequestsManager";
import { VipIconManager } from "@/components/admin-v3/vip/VipIconManager";
import { VipPopupManager } from "@/components/admin-v3/vip/VipPopupManager";
import { AssistantManager } from "@/components/admin-v3/assistant/AssistantManager";
import { LogoManager } from "@/components/admin-v3/branding/LogoManager";
import { SiteLogo } from "@/components/candy/site-logo";

export type AdminV3Me = {
  username: string;
  role: string;
  avatar_url?: string | null;
};

type SectionKey =
  | "dashboard"
  | "members"
  | "second_accounts"
  | "posts"
  | "guides"
  | "live_moc"
  | "community_vip"
  | "notifications"
  | "required_popup"
  | "gif_library"
  | "gift_history"
  | "coin_transfers"
  | "vip_icons"
  | "vip_popup"
  | "secret_connect"
  | "stats"
  | "withdrawals"
  | "assistant"
  | "site_logo"
  | "settings";

const BASE_NAV: { key: SectionKey; label: string; icon: any; emoji: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, emoji: "🏠" },
  { key: "members", label: "Quản lý thành viên", icon: Users, emoji: "👤" },
  { key: "second_accounts", label: "Tài khoản thứ hai", icon: Users, emoji: "🕶️" },
  { key: "posts", label: "Quản lý bài viết", icon: FileText, emoji: "📝" },
  { key: "live_moc", label: "Quản lý Live Móc 🦋", icon: Settings, emoji: "🦋" },
  { key: "community_vip", label: "Quản lý Cộng Đồng VIP", icon: Users, emoji: "👑" },
  { key: "notifications", label: "Thông báo", icon: Bell, emoji: "📢" },
  { key: "required_popup", label: "Popup bắt buộc", icon: Bell, emoji: "🚨" },
  { key: "gif_library", label: "Kho GIF", icon: FileText, emoji: "🎞️" },
  { key: "gift_history", label: "Lịch sử quà tặng", icon: Wallet, emoji: "🎁" },
  { key: "coin_transfers", label: "Quản lý chuyển xu", icon: Wallet, emoji: "🪙" },
  { key: "vip_icons", label: "Quản lý Icon VIP (Media VIP)", icon: ShieldCheck, emoji: "⭐" },
  { key: "vip_popup", label: "Quản lý Popup VIP", icon: ShieldCheck, emoji: "🔒" },
  { key: "secret_connect", label: "Kết Nối Bí Mật", icon: Wallet, emoji: "❤️" },
  { key: "withdrawals", label: "Yêu cầu rút tiền", icon: Wallet, emoji: "💳" },
  { key: "assistant", label: "Trợ lý (Mini Chat)", icon: Bell, emoji: "🤖" },
  { key: "stats", label: "Thống kê", icon: BarChart3, emoji: "📊" },

  { key: "site_logo", label: "Cài đặt → Logo Website", icon: Settings, emoji: "🖼️" },
  { key: "settings", label: "Cài đặt", icon: Settings, emoji: "⚙️" },
];

export function AdminV3Shell({
  me,
  onLogout,
  onBack,
}: {
  me: AdminV3Me;
  onLogout: () => void;
  onBack?: () => void;
}) {
  const [active, setActive] = useState<SectionKey>(() => {
    if (typeof window !== "undefined") {
      const s = new URLSearchParams(window.location.search).get("section");
      const allowed: SectionKey[] = [
        "dashboard","members","second_accounts","posts","live_moc","community_vip","notifications","required_popup","gif_library","gift_history","coin_transfers","vip_icons","vip_popup","secret_connect","withdrawals","assistant","stats","site_logo","settings",
      ];
      if (s && (allowed as string[]).includes(s)) return s as SectionKey;
    }
    return "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pendingReports = usePendingReportsCount();
  const { items: pendingWithdrawals, count: withdrawCount } = usePendingWithdrawals();
  const [bellOpen, setBellOpen] = useState(false);

  const go = (s: SectionKey) => {
    setActive(s);
    setSidebarOpen(false);
  };

  // Chỉ Bang Chủ (admin_1) / super_admin thấy "Tài khoản thứ hai".
  const isSuperAdmin = me.role === "admin_1" || me.role === "super_admin" || me.role === "admin";
  const NAV = BASE_NAV.filter((n) => n.key !== "second_accounts" || isSuperAdmin);
  const activeLabel = NAV.find((n) => n.key === active)?.label ?? "";


  return (
    <div className="admv3-root">
      {/* MOBILE BACKDROP */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="admv3-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* SIDEBAR */}
      <aside className={`admv3-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="admv3-brand">
          <div className="admv3-brand-mark">
            <SiteLogo size={26} alt="Logo website" />
          </div>
          <div className="admv3-brand-text">
            <div className="admv3-brand-title">Diễn Đàn FWB</div>
            <div className="admv3-brand-sub">Admin Panel</div>
          </div>
          <button
            className="admv3-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="admv3-nav">
          {NAV.map((n) => {
            const isActive = active === n.key;
            return (
              <button
                key={n.key}
                className={`admv3-nav-item ${isActive ? "is-active" : ""}`}
                onClick={() => go(n.key)}
              >
                <span className="admv3-nav-emoji">{n.emoji}</span>
                <span className="admv3-nav-label">{n.label}</span>
                {n.key === "posts" && pendingReports > 0 && (
                  <span className="admv3-badge">{formatBadge(pendingReports)}</span>
                )}
                {n.key === "withdrawals" && withdrawCount > 0 && (
                  <span className="admv3-badge admv3-badge-alert">{formatBadge(withdrawCount)}</span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="admv3-active-pill"
                    className="admv3-active-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}

          <div className="admv3-divider" />

          {onBack && (
            <button className="admv3-nav-item admv3-nav-back" onClick={onBack}>
              <span className="admv3-nav-emoji">🌐</span>
              <span className="admv3-nav-label">Về Website</span>
              <ChevronRight size={14} className="admv3-nav-caret" />
            </button>
          )}
        </nav>

        <div className="admv3-sidebar-footer">
          <div className="admv3-health">
            <span className="admv3-health-dot" />
            <span>Hệ thống hoạt động ổn định</span>
          </div>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="admv3-column">
        {/* HEADER */}
        <header className="admv3-header">
          <div className="admv3-header-left">
            <button
              className="admv3-hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở menu"
            >
              <Menu size={18} />
            </button>
            <div className="admv3-crumb">
              <span className="admv3-crumb-muted">Admin Panel</span>
              <ChevronRight size={13} />
              <span className="admv3-crumb-current">{activeLabel}</span>
            </div>
          </div>

          <div className="admv3-header-right">
            <div className="admv3-search">
              <Search size={14} />
              <input placeholder="Tìm nhanh…" />
            </div>
            {onBack && (
              <button
                className="admv3-btn admv3-btn-ghost admv3-btn-back-site"
                onClick={onBack}
              >
                <Globe size={14} />
                <span>Về Website</span>
              </button>
            )}
            <div className="admv3-bell-wrap">
              <button
                className="admv3-btn admv3-btn-icon admv3-bell"
                onClick={() => setBellOpen((v) => !v)}
                aria-label="Thông báo"
                title="Thông báo"
              >
                <Bell size={15} />
                {withdrawCount > 0 && (
                  <span className="admv3-bell-dot">{formatBadge(withdrawCount)}</span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="admv3-bell-backdrop" onClick={() => setBellOpen(false)} />
                  <div className="admv3-bell-menu">
                    <div className="admv3-bell-head">
                      Thông báo {withdrawCount > 0 ? `(${withdrawCount})` : ""}
                    </div>
                    {withdrawCount === 0 ? (
                      <div className="admv3-bell-empty">Không có yêu cầu mới</div>
                    ) : (
                      pendingWithdrawals.map((w) => (
                        <button
                          key={w.id}
                          className="admv3-bell-item"
                          onClick={() => { setBellOpen(false); go("withdrawals"); }}
                        >
                          <span className="admv3-bell-emoji">💳</span>
                          <span className="admv3-bell-text">
                            <b>{w.full_name || "Thành viên"}</b> vừa gửi yêu cầu rút{" "}
                            {formatNumber(Number(w.amount || 0))} xu
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="admv3-user">
              <div className="admv3-avatar">
                {me.avatar_url ? (
                  <img loading="lazy" decoding="async" src={avatarSrc(me.avatar_url, 64)} alt={me.username} />
                ) : (
                  <span>{me.username?.[0]?.toUpperCase() || "A"}</span>
                )}
              </div>
              <div className="admv3-user-meta">
                <div className="admv3-user-name">{me.username}</div>
                <div className="admv3-user-role">{me.role}</div>
              </div>
            </div>
            <button
              className="admv3-btn admv3-btn-icon"
              onClick={onLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* MAIN */}
        <main className="admv3-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {active === "dashboard" && (
                <DashboardSection pendingReports={pendingReports} onJump={go} />
              )}
              {active === "members" && <MembersManager />}
              {active === "second_accounts" && isSuperAdmin && <SecondAccountsManager />}

              {active === "posts" && <PostsSection pendingReports={pendingReports} />}
              {active === "live_moc" && <LiveMocManager />}
              {active === "community_vip" && <CommunityVipManager />}
              {active === "guides" && <GuidesManager />}
              {active === "notifications" && <PopupManager />}
              {active === "required_popup" && <RequiredPopupManager />}
              {active === "gif_library" && <GifLibraryManager />}
              {active === "gift_history" && <GiftHistoryManager />}
              {active === "coin_transfers" && <CoinTransfersManager />}
              {active === "vip_icons" && <VipIconManager />}
              {active === "vip_popup" && <VipPopupManager />}
              {active === "secret_connect" && <SecretConnectManager />}
              {active === "withdrawals" && <WithdrawalRequestsManager />}
              {active === "assistant" && <AssistantManager />}
              {active === "stats" && <StatsDashboard />}
              {active === "site_logo" && <LogoManager />}
              {active === "settings" && <CrmManager />}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AdminV3Styles />
    </div>
  );
}

/* ============================================================
   SECTIONS
   ============================================================ */

type PostRange = "today" | "week" | "month";

function DashboardSection({
  pendingReports,
  onJump,
}: {
  pendingReports: number;
  onJump: (s: SectionKey) => void;
}) {
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [postsRange, setPostsRange] = useState<PostRange>("today");
  const [postsNow, setPostsNow] = useState<number | null>(null);
  const [postsPrev, setPostsPrev] = useState<number | null>(null);
  const [regNow, setRegNow] = useState<number | null>(null);
  const [regPrev, setRegPrev] = useState<number | null>(null);

  const sb: any = supabase;

  // Tổng thành viên + đang online: tải khi mở và khi tab quay lại foreground.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [tot, on] = await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }),
        sb.from("profiles").select("id", { count: "exact", head: true }).eq("is_online", true),
      ]);
      if (!alive) return;
      setTotalMembers(tot.count ?? 0);
      setOnline(on.count ?? 0);
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Cập nhật NGAY khi Admin xóa toàn bộ tài khoản / bài viết (không cần F5).
    let off = () => {};
    void (async () => {
      const { onAdminPurge } = await import("@/lib/admin-broadcast");
      off = onAdminPurge((kind) => {
        if (kind === "accounts") { setTotalMembers(0); setOnline(0); }
        if (kind === "posts") { setPostsNow(0); setPostsPrev(0); }
        void load();
      });
    })();
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      off();
    };
  }, [sb]);


  // Bài viết theo khoảng thời gian + so sánh kỳ trước.
  const loadPosts = useCallback(async () => {
    const now = new Date();
    let nowStart: Date, prevStart: Date, prevEnd: Date;
    if (postsRange === "today") {
      nowStart = new Date(now); nowStart.setHours(0, 0, 0, 0);
      prevStart = new Date(nowStart.getTime() - 24 * 3600_000);
      prevEnd = nowStart;
    } else if (postsRange === "week") {
      nowStart = new Date(now); nowStart.setDate(now.getDate() - 7);
      prevStart = new Date(nowStart.getTime() - 7 * 24 * 3600_000);
      prevEnd = nowStart;
    } else {
      nowStart = new Date(now); nowStart.setDate(now.getDate() - 30);
      prevStart = new Date(nowStart.getTime() - 30 * 24 * 3600_000);
      prevEnd = nowStart;
    }
    const [a, b] = await Promise.all([
      sb.from("posts").select("id", { count: "exact", head: true }).gte("created_at", nowStart.toISOString()),
      sb.from("posts").select("id", { count: "exact", head: true }).gte("created_at", prevStart.toISOString()).lt("created_at", prevEnd.toISOString()),
    ]);
    setPostsNow(a.count ?? 0);
    setPostsPrev(b.count ?? 0);
  }, [postsRange, sb]);
  useEffect(() => { void loadPosts(); }, [loadPosts]);

  // Đăng ký mới: tuần này vs tuần trước.
  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const wStart = new Date(now); wStart.setDate(now.getDate() - 7);
      const wPrev = new Date(wStart.getTime() - 7 * 24 * 3600_000);
      const [a, b] = await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", wStart.toISOString()),
        sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", wPrev.toISOString()).lt("created_at", wStart.toISOString()),
      ]);
      setRegNow(a.count ?? 0);
      setRegPrev(b.count ?? 0);
    };
    void load();
  }, [sb]);

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("vi-VN"));
  const pctDelta = (nowV: number | null, prev: number | null): string => {
    if (nowV == null || prev == null) return "";
    if (prev === 0) return nowV > 0 ? "+100%" : "0%";
    const d = ((nowV - prev) / prev) * 100;
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toFixed(0)}%`;
  };

  return (
    <div className="admv3-page">
      <PageHeader
        title="Dashboard"
        subtitle="Tổng quan hệ thống — số liệu thời gian thực"
      />

      <div className="admv3-stats">
        <StatCard label="Tổng thành viên" value={fmt(totalMembers)} icon={Users} tone="blue" />
        <StatCard label="Đang online" value={fmt(online)} icon={Activity} tone="green" live />
        <StatCard
          label={`Bài viết ${postsRange === "today" ? "hôm nay" : postsRange === "week" ? "tuần này" : "tháng này"}`}
          value={fmt(postsNow)}
          icon={FileText}
          tone="violet"
          delta={pctDelta(postsNow, postsPrev)}
        />
        <StatCard label="Doanh thu" value="—" icon={DollarSign} tone="amber" />
      </div>

      <div style={{ display: "flex", gap: 6, margin: "4px 0 12px" }}>
        {(["today", "week", "month"] as PostRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setPostsRange(r)}
            className={`admv3-btn ${postsRange === r ? "admv3-btn-primary" : "admv3-btn-ghost"}`}
            style={{ fontSize: 12 }}
          >
            {r === "today" ? "Hôm nay" : r === "week" ? "Tuần này" : "Tháng này"}
          </button>
        ))}
      </div>

      <div className="admv3-grid-2">
        <MiniCard
          title="Đăng ký mới (tuần này)"
          icon={UserPlus}
          value={fmt(regNow)}
          hint={regPrev != null ? `Tuần trước: ${fmt(regPrev)} · ${pctDelta(regNow, regPrev)}` : "So với tuần trước"}
        />
        <MiniCard
          title="Báo cáo chờ xử lý"
          icon={Flag}
          value={String(pendingReports || 0)}
          hint="Cần duyệt"
          highlight={pendingReports > 0}
        />
      </div>

      <div className="admv3-section-title">Bảng điều khiển</div>
      <div className="admv3-quick-grid">
        {BASE_NAV.filter((n) => n.key !== "dashboard" && n.key !== "second_accounts").map((n) => (
          <button
            key={n.key}
            className="admv3-quick-card"
            onClick={() => onJump(n.key)}
          >
            <span className="admv3-quick-emoji">{n.emoji}</span>
            <div className="admv3-quick-body">
              <div className="admv3-quick-title">{n.label}</div>
              <div className="admv3-quick-hint">Mở khu vực</div>
            </div>
            <ChevronRight size={16} className="admv3-quick-caret" />
          </button>
        ))}
      </div>

      <div className="admv3-section-title">Duyệt bài & thao tác nhanh</div>
      <div className="admv3-card">
        <AdminMasterReviewPanel />
      </div>
    </div>
  );
}


function PostsSection({ pendingReports }: { pendingReports: number }) {
  const [tab, setTab] = useState<"posts" | "pending" | "reports" | "keywords">("posts");
  const tabs = [
    { key: "posts" as const, label: "Bài viết", icon: FileText },
    { key: "pending" as const, label: "Bài viết chờ duyệt", icon: Clock },
    { key: "reports" as const, label: "Báo cáo", icon: Flag, badge: pendingReports },
    { key: "keywords" as const, label: "Bộ lọc từ khóa", icon: ShieldCheck },
  ];
  return (
    <div className="admv3-page">
      <PageHeader title="Quản lý bài viết" subtitle="Bài viết · Chờ duyệt · Báo cáo · Bộ lọc từ khóa" />
      <div className="admv3-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`admv3-tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={14} />
            <span>{t.label}</span>
            {t.badge != null && t.badge > 0 && (
              <span className="admv3-badge">{formatBadge(t.badge)}</span>
            )}
          </button>
        ))}
      </div>
      <div className="admv3-card">
        {tab === "posts" && <HomePostsManager />}
        {tab === "pending" && <PendingPostsManager />}
        {tab === "reports" && <ReportsManager />}
        {tab === "keywords" && <KeywordManager />}
      </div>
    </div>
  );
}

function TransactionsSection() {
  return (
    <div className="admv3-page">
      <PageHeader title="Giao dịch" subtitle="Lịch sử tặng quà và giao dịch trong hệ thống" />
      <div className="admv3-card">
        <GiftHistoryManager />
      </div>
    </div>
  );
}

function PlaceholderSection({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="admv3-page">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="admv3-empty">
        <div className="admv3-empty-icon">
          <Settings size={22} />
        </div>
        <div className="admv3-empty-title">Đang chuẩn bị</div>
        <div className="admv3-empty-sub">Khu vực này sẽ sớm được cập nhật.</div>
      </div>
    </div>
  );
}

/* ============================================================
   UI HELPERS
   ============================================================ */

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="admv3-page-header">
      <div>
        <h1 className="admv3-page-title">{title}</h1>
        {subtitle && <p className="admv3-page-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  live,
}: {
  label: string;
  value: string;
  icon: any;
  tone: "blue" | "green" | "violet" | "amber";
  delta?: string;
  live?: boolean;
}) {
  return (
    <motion.div
      className={`admv3-stat admv3-stat-${tone}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
    >
      <div className="admv3-stat-head">
        <span className="admv3-stat-label">{label}</span>
        <span className="admv3-stat-icon">
          <Icon size={16} />
        </span>
      </div>
      <div className="admv3-stat-value">{value}</div>
      <div className="admv3-stat-foot">
        {live && <span className="admv3-live"><span className="admv3-live-dot" /> Live</span>}
        {delta && (
          <span className="admv3-delta">
            <TrendingUp size={11} /> {delta}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function MiniCard({
  title,
  value,
  icon: Icon,
  hint,
  highlight,
}: {
  title: string;
  value: string;
  icon: any;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <motion.div
      className={`admv3-mini ${highlight ? "is-hot" : ""}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
    >
      <div className="admv3-mini-icon">
        <Icon size={16} />
      </div>
      <div className="admv3-mini-body">
        <div className="admv3-mini-title">{title}</div>
        <div className="admv3-mini-value">{value}</div>
        {hint && <div className="admv3-mini-hint">{hint}</div>}
      </div>
    </motion.div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

function AdminV3Styles() {
  return (
    <style>{`
      .admv3-root {
        --v3-bg: #f6f7f9;
        --v3-surface: #ffffff;
        --v3-border: rgba(15, 23, 42, 0.06);
        --v3-border-strong: rgba(15, 23, 42, 0.1);
        --v3-text: #0f172a;
        --v3-text-muted: #64748b;
        --v3-text-soft: #94a3b8;
        --v3-primary: #2563eb;
        --v3-primary-soft: rgba(37, 99, 235, 0.08);
        --v3-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
        --v3-shadow-md: 0 4px 16px rgba(15, 23, 42, 0.06);
        --v3-shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.08);
        --v3-radius: 20px;
        --v3-radius-sm: 12px;

        min-height: 100vh;
        display: flex;
        background: var(--v3-bg);
        color: var(--v3-text);
        font-family: 'Inter', 'Be Vietnam Pro', -apple-system, system-ui, sans-serif;
        letter-spacing: -0.005em;
      }

      /* SIDEBAR */
      .admv3-sidebar {
        width: 260px;
        flex-shrink: 0;
        background: var(--v3-surface);
        border-right: 1px solid var(--v3-border);
        display: flex;
        flex-direction: column;
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 30;
      }
      .admv3-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px 20px 16px;
      }
      .admv3-brand-mark {
        width: 36px; height: 36px;
        border-radius: 10px;
        background: linear-gradient(135deg, #2563eb, #60a5fa);
        color: white;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
      }
      .admv3-brand-text { flex: 1; min-width: 0; }
      .admv3-brand-title { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
      .admv3-brand-sub { font-size: 11px; color: var(--v3-text-soft); font-weight: 500; }
      .admv3-close {
        display: none;
        background: none; border: none;
        color: var(--v3-text-muted);
        cursor: pointer;
        padding: 6px; border-radius: 8px;
      }
      .admv3-close:hover { background: var(--v3-primary-soft); }

      .admv3-nav {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px 16px;
        display: flex; flex-direction: column; gap: 2px;
      }
      .admv3-nav-item {
        position: relative;
        display: flex; align-items: center; gap: 12px;
        width: 100%;
        padding: 10px 12px;
        border: none; background: none;
        border-radius: 12px;
        color: var(--v3-text-muted);
        font-size: 14px; font-weight: 500;
        text-align: left;
        cursor: pointer;
        transition: color 0.18s, background 0.18s;
      }
      .admv3-nav-item:hover {
        background: var(--v3-primary-soft);
        color: var(--v3-text);
      }
      .admv3-nav-item.is-active {
        color: var(--v3-primary);
        background: var(--v3-primary-soft);
      }
      .admv3-nav-emoji { font-size: 16px; width: 20px; text-align: center; }
      .admv3-nav-label { flex: 1; }
      .admv3-nav-caret { color: var(--v3-text-soft); }
      .admv3-active-pill {
        position: absolute;
        left: -12px;
        top: 8px; bottom: 8px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--v3-primary);
      }
      .admv3-badge {
        min-width: 20px; height: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: #ef4444;
        color: white;
        font-size: 11px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .admv3-badge-alert { animation: admv3-pulse 1.6s ease-in-out infinite; }
      @keyframes admv3-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.55); }
        50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
      }
      .admv3-bell-wrap { position: relative; }
      .admv3-bell { position: relative; }
      .admv3-bell-dot {
        position: absolute; top: -5px; right: -5px;
        min-width: 17px; height: 17px; padding: 0 4px;
        border-radius: 999px; background: #ef4444; color: #fff;
        font-size: 10px; font-weight: 800;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .admv3-bell-backdrop { position: fixed; inset: 0; z-index: 40; }
      .admv3-bell-menu {
        position: absolute; right: 0; top: calc(100% + 8px);
        width: 300px; max-height: 340px; overflow: auto; z-index: 50;
        background: var(--v3-card, #fff);
        border: 1px solid var(--v3-border); border-radius: 14px;
        box-shadow: 0 18px 40px rgba(15,23,42,.16); padding: 6px;
      }
      .admv3-bell-head { padding: 8px 10px; font-size: 12px; font-weight: 800; opacity: .7; }
      .admv3-bell-empty { padding: 14px 10px; font-size: 13px; opacity: .6; }
      .admv3-bell-item {
        display: flex; gap: 8px; align-items: flex-start; width: 100%;
        padding: 9px 10px; border-radius: 10px; text-align: left;
        font-size: 12.5px; line-height: 1.35; cursor: pointer; background: transparent;
      }
      .admv3-bell-item:hover { background: rgba(239,68,68,.08); }
      .admv3-bell-emoji { font-size: 15px; line-height: 1.2; }

      .admv3-divider {
        height: 1px;
        background: var(--v3-border);
        margin: 12px 4px;
      }
      .admv3-nav-back { color: var(--v3-text); }

      .admv3-sidebar-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--v3-border);
      }
      .admv3-health {
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; color: var(--v3-text-muted);
      }
      .admv3-health-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
      }

      /* COLUMN */
      .admv3-column {
        flex: 1;
        min-width: 0;
        display: flex; flex-direction: column;
      }

      /* HEADER */
      .admv3-header {
        position: sticky; top: 0;
        z-index: 20;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--v3-border);
        padding: 12px 24px;
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px;
      }
      .admv3-header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .admv3-header-right { display: flex; align-items: center; gap: 10px; }
      .admv3-hamburger {
        display: none;
        border: none; background: none;
        padding: 8px; border-radius: 10px;
        color: var(--v3-text); cursor: pointer;
      }
      .admv3-hamburger:hover { background: var(--v3-primary-soft); }
      .admv3-crumb {
        display: flex; align-items: center; gap: 6px;
        font-size: 13px; color: var(--v3-text-muted);
      }
      .admv3-crumb-current { color: var(--v3-text); font-weight: 600; }

      .admv3-search {
        display: flex; align-items: center; gap: 8px;
        background: var(--v3-bg);
        border: 1px solid var(--v3-border);
        border-radius: 12px;
        padding: 8px 12px;
        min-width: 220px;
        transition: border-color 0.18s, background 0.18s;
      }
      .admv3-search:focus-within {
        background: white;
        border-color: rgba(37, 99, 235, 0.35);
      }
      .admv3-search svg { color: var(--v3-text-soft); }
      .admv3-search input {
        border: none; background: none; outline: none;
        font-size: 13px; flex: 1;
        color: var(--v3-text);
      }
      .admv3-search input::placeholder { color: var(--v3-text-soft); }

      .admv3-btn {
        display: inline-flex; align-items: center; gap: 6px;
        border: 1px solid var(--v3-border);
        background: white;
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 13px; font-weight: 600;
        color: var(--v3-text);
        cursor: pointer;
        transition: transform 0.18s, box-shadow 0.18s, background 0.18s;
      }
      .admv3-btn:hover {
        transform: translateY(-1px);
        box-shadow: var(--v3-shadow-sm);
      }
      .admv3-btn-ghost {
        background: transparent;
      }
      .admv3-btn-icon { padding: 8px; }
      .admv3-btn-back-site { background: linear-gradient(180deg, #ffffff, #f8fafc); }

      .admv3-user {
        display: flex; align-items: center; gap: 10px;
        padding: 4px 10px 4px 4px;
        border: 1px solid var(--v3-border);
        border-radius: 999px;
        background: white;
      }
      .admv3-avatar {
        width: 30px; height: 30px;
        border-radius: 50%;
        overflow: hidden;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700;
      }
      .admv3-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .admv3-user-meta { line-height: 1.2; }
      .admv3-user-name { font-size: 12px; font-weight: 700; }
      .admv3-user-role { font-size: 10px; color: var(--v3-text-muted); }

      /* MAIN */
      .admv3-main {
        flex: 1;
        padding: 24px;
        max-width: 100%;
      }
      .admv3-page { display: flex; flex-direction: column; gap: 20px; }
      .admv3-page-header { display: flex; justify-content: space-between; align-items: flex-end; }
      .admv3-page-title {
        font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0;
      }
      .admv3-page-sub {
        font-size: 13px; color: var(--v3-text-muted); margin: 4px 0 0;
      }
      .admv3-section-title {
        font-size: 13px; font-weight: 600; color: var(--v3-text-muted);
        text-transform: uppercase; letter-spacing: 0.05em;
        margin-top: 8px;
      }

      /* STATS */
      .admv3-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }
      .admv3-stat {
        background: var(--v3-surface);
        border: 1px solid var(--v3-border);
        border-radius: var(--v3-radius);
        padding: 18px 20px;
        box-shadow: var(--v3-shadow-sm);
        transition: box-shadow 0.18s;
      }
      .admv3-stat:hover { box-shadow: var(--v3-shadow-md); }
      .admv3-stat-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px;
      }
      .admv3-stat-label { font-size: 12px; color: var(--v3-text-muted); font-weight: 500; }
      .admv3-stat-icon {
        width: 32px; height: 32px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
      }
      .admv3-stat-blue .admv3-stat-icon { background: rgba(37, 99, 235, 0.1); color: #2563eb; }
      .admv3-stat-green .admv3-stat-icon { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
      .admv3-stat-violet .admv3-stat-icon { background: rgba(124, 58, 237, 0.1); color: #7c3aed; }
      .admv3-stat-amber .admv3-stat-icon { background: rgba(245, 158, 11, 0.1); color: #d97706; }
      .admv3-stat-value {
        font-size: 26px; font-weight: 700; letter-spacing: -0.02em;
      }
      .admv3-stat-foot {
        display: flex; gap: 8px; align-items: center;
        margin-top: 6px; font-size: 11px; color: var(--v3-text-muted);
      }
      .admv3-live {
        display: inline-flex; align-items: center; gap: 4px;
        color: #16a34a; font-weight: 600;
      }
      .admv3-live-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
        animation: admv3-pulse 1.5s ease-in-out infinite;
      }
      .admv3-delta { color: #16a34a; display: inline-flex; align-items: center; gap: 2px; }
      @keyframes admv3-pulse {
        0%,100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* MINI */
      .admv3-grid-2 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }
      .admv3-mini {
        background: var(--v3-surface);
        border: 1px solid var(--v3-border);
        border-radius: var(--v3-radius);
        padding: 16px;
        display: flex; gap: 12px; align-items: center;
        box-shadow: var(--v3-shadow-sm);
        transition: box-shadow 0.18s;
      }
      .admv3-mini:hover { box-shadow: var(--v3-shadow-md); }
      .admv3-mini.is-hot {
        border-color: rgba(239, 68, 68, 0.3);
        background: linear-gradient(180deg, #fff, #fef2f2);
      }
      .admv3-mini-icon {
        width: 36px; height: 36px; border-radius: 10px;
        background: var(--v3-primary-soft);
        color: var(--v3-primary);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .admv3-mini.is-hot .admv3-mini-icon { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
      .admv3-mini-title { font-size: 12px; color: var(--v3-text-muted); font-weight: 500; }
      .admv3-mini-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
      .admv3-mini-hint { font-size: 10px; color: var(--v3-text-soft); }

      /* QUICK */
      .admv3-quick-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .admv3-quick-card {
        display: flex; align-items: center; gap: 12px;
        background: var(--v3-surface);
        border: 1px solid var(--v3-border);
        border-radius: 16px;
        padding: 14px 16px;
        text-align: left;
        cursor: pointer;
        transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
        box-shadow: var(--v3-shadow-sm);
      }
      .admv3-quick-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--v3-shadow-md);
        border-color: rgba(37, 99, 235, 0.25);
      }
      .admv3-quick-emoji { font-size: 22px; }
      .admv3-quick-body { flex: 1; }
      .admv3-quick-title { font-size: 14px; font-weight: 600; }
      .admv3-quick-hint { font-size: 11px; color: var(--v3-text-muted); }
      .admv3-quick-caret { color: var(--v3-text-soft); }

      /* CARD */
      .admv3-card {
        background: var(--v3-surface);
        border: 1px solid var(--v3-border);
        border-radius: var(--v3-radius);
        padding: 20px;
        box-shadow: var(--v3-shadow-sm);
      }

      /* TABS */
      .admv3-tabs {
        display: flex; gap: 4px;
        background: var(--v3-surface);
        border: 1px solid var(--v3-border);
        border-radius: 14px;
        padding: 4px;
        width: fit-content;
        box-shadow: var(--v3-shadow-sm);
      }
      .admv3-tab {
        display: inline-flex; align-items: center; gap: 6px;
        border: none; background: none;
        padding: 8px 14px;
        border-radius: 10px;
        font-size: 13px; font-weight: 600;
        color: var(--v3-text-muted);
        cursor: pointer;
        transition: color 0.18s, background 0.18s;
      }
      .admv3-tab:hover { color: var(--v3-text); }
      .admv3-tab.is-active {
        background: var(--v3-primary-soft);
        color: var(--v3-primary);
      }

      /* EMPTY */
      .admv3-empty {
        background: var(--v3-surface);
        border: 1px dashed var(--v3-border-strong);
        border-radius: var(--v3-radius);
        padding: 60px 20px;
        text-align: center;
      }
      .admv3-empty-icon {
        width: 48px; height: 48px; border-radius: 14px;
        background: var(--v3-primary-soft); color: var(--v3-primary);
        display: inline-flex; align-items: center; justify-content: center;
        margin-bottom: 12px;
      }
      .admv3-empty-title { font-size: 16px; font-weight: 700; }
      .admv3-empty-sub { font-size: 13px; color: var(--v3-text-muted); margin-top: 4px; }

      /* BACKDROP */
      .admv3-backdrop {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, 0.4);
        backdrop-filter: blur(4px);
        z-index: 25;
      }

      /* RESPONSIVE */
      @media (max-width: 1200px) {
        .admv3-stats { grid-template-columns: repeat(2, 1fr); }
        .admv3-grid-2 { grid-template-columns: repeat(2, 1fr); }
        .admv3-quick-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 768px) {
        .admv3-sidebar {
          position: fixed; left: 0; top: 0;
          transform: translateX(-100%);
          transition: transform 0.22s ease;
        }
        .admv3-sidebar.is-open { transform: translateX(0); }
        .admv3-close { display: inline-flex; }
        .admv3-hamburger { display: inline-flex; }
        .admv3-search { display: none; }
        .admv3-btn-back-site span { display: none; }
        .admv3-user-meta { display: none; }
        .admv3-main { padding: 16px; }
        .admv3-stats { grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .admv3-grid-2 { grid-template-columns: 1fr; }
        .admv3-quick-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
