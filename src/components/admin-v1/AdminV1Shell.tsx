import { useState, type ReactNode } from "react";
import {
  Home, MapPin, Briefcase, Menu, X, Settings, LogOut, LayoutDashboard,
  Users, FileText, Flag, BarChart3, Image as ImageIcon, ShieldCheck,
  Lock, Crown, Coins, Activity, TrendingUp, TrendingDown, ShieldAlert,
  ExternalLink, MessageSquare, UserCog, Search, Globe, Wifi, Ban,
  Star, Clock, UserPlus, RefreshCw, MonitorSmartphone, ChevronRight,
  ArrowUpRight, ArrowDownRight, Eye, Heart, MessageCircle, DollarSign,
  Wallet, Send, Inbox, Trophy, Zap, Pin,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { HomePostsManager } from "./HomePostsManager";
import { SearchModal } from "@/components/candy/search-modal";
import { KeywordManager } from "@/components/candy/admin-modules/keyword-manager";
import { AdminMasterReviewPanel } from "./AdminMasterReviewPanel";
import { NearbyCloneManager } from "./NearbyCloneManager";
import { usePendingReportsCount, formatBadge } from "@/hooks/use-pending-reports-count";

import { ReportsManagerV2 as ReportsManager } from "./redesign/ReportsManagerV2";
import { GiftHistoryManager } from "./GiftHistoryManager";

/* ============================================================
   Chấm đỏ báo cáo chưa xử lý
   ============================================================ */
function ReportDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="adm1-report-dot">{formatBadge(count)}</span>;
}

export type AdminV1Me = {
  username: string;
  role: string;
  avatar_url?: string | null;
};

type SectionKey =
  | "dashboard"
  | "home"
  | "account"
  | "nearby"
  | "agent"
  | "stats"
  | "global-msg"
  | "settings"
  | "admin-mgmt";

const NAV: { key: SectionKey; label: string; icon: any }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "home", label: "Quản Lý Trang Chủ", icon: Home },
  { key: "account", label: "Quản Lý Tài Khoản", icon: Users },
  { key: "nearby", label: "Quản Lý Tìm Quanh Đây", icon: MapPin },
  { key: "agent", label: "Quản Lý Đại Lý", icon: Briefcase },
  { key: "stats", label: "Thống Kê & Phân Tích", icon: BarChart3 },
  { key: "global-msg", label: "Global Messages", icon: MessageSquare },
  { key: "settings", label: "Cài Đặt Hệ Thống", icon: Settings },
  { key: "admin-mgmt", label: "Quản Lý Admin", icon: UserCog },
];

export function AdminV1Shell({
  me,
  onLogout,
  onBack,
}: {
  me: AdminV1Me;
  onLogout: () => void;
  onBack?: () => void;
}) {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pendingReports = usePendingReportsCount();

  const go = (s: SectionKey) => {
    setActive(s);
    setSidebarOpen(false);
  };

  const activeLabel = NAV.find((n) => n.key === active)?.label ?? "";

  return (
    <div className="adm1-root">
      {/* Ambient SOC background */}
      <div className="adm1-bg-grid" aria-hidden />
      <div className="adm1-bg-glow" aria-hidden />

      {/* SIDEBAR (desktop persistent + mobile drawer) */}
      {sidebarOpen && <div className="adm1-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`adm1-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="adm1-sidebar-brand">
          <div className="adm1-brand-mark">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="adm1-brand-title">SOC ADMIN</div>
            <div className="adm1-brand-sub">Security Operations</div>
          </div>
          <button
            className="adm1-icon-btn adm1-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <div className="adm1-sidebar-user">
          <div className="adm1-avatar">
            {me.avatar_url ? (
              <img loading="lazy" decoding="async" src={me.avatar_url} alt={me.username} />
            ) : (
              <span>{me.username?.[0]?.toUpperCase() || "A"}</span>
            )}
            <span className="adm1-status-dot" />
          </div>
          <div className="adm1-userinfo">
            <div className="adm1-username">{me.username}</div>
            <div className="adm1-userrole">
              <ShieldCheck size={10} /> {me.role}
            </div>
          </div>
        </div>

        <nav className="adm1-sidebar-nav">
          <div className="adm1-nav-label">Điều hướng</div>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`adm1-side-item ${active === n.key ? "is-active" : ""}`}
              onClick={() => go(n.key)}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              {n.key === "home" && <ReportDot count={pendingReports} />}
              <ChevronRight size={14} className="adm1-side-caret" />
            </button>
          ))}

          <div className="adm1-nav-label" style={{ marginTop: 14 }}>Hệ thống</div>
          {onBack && (
            <button className="adm1-side-item adm1-side-back" onClick={onBack}>
              <ExternalLink size={17} />
              <span>Trở lại website</span>
            </button>
          )}
          <button className="adm1-side-item adm1-side-danger" onClick={onLogout}>
            <LogOut size={17} />
            <span>Đăng xuất</span>
          </button>
        </nav>

        <div className="adm1-sidebar-footer">
          <div className="adm1-sys-row">
            <span className="adm1-sys-dot adm1-sys-dot-good" />
            <span>System healthy</span>
          </div>
          <div className="adm1-sys-row adm1-sys-muted">
            <Wifi size={11} /> Realtime sync active
          </div>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="adm1-column">
        {/* TOP BAR */}
        <header className="adm1-topbar">
          <button
            className="adm1-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>

          <div className="adm1-breadcrumb">
            <span className="adm1-crumb-muted">Admin</span>
            <ChevronRight size={13} />
            <span className="adm1-crumb-current">{activeLabel}</span>
          </div>

          <div className="adm1-topbar-tools">
            <div className="adm1-search">
              <Search size={14} />
              <input placeholder="Tìm user, bài, giao dịch…" />
              <kbd>⌘K</kbd>
            </div>
            {onBack && (
              <button
                className="adm1-back-site"
                onClick={onBack}
                title="Trở lại website"
              >
                <ExternalLink size={13} />
                <span>Về website</span>
              </button>
            )}
            <button className="adm1-icon-btn" onClick={onLogout} aria-label="Đăng xuất">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* MAIN */}
        <main className="adm1-main">
          {active === "dashboard" && <DashboardOverview onJump={go} pendingReports={pendingReports} />}
          {active === "home" && <HomeManager pendingReports={pendingReports} />}
          {active === "account" && <AccountManagement />}
          {active === "nearby" && <NearbyManager />}
          {active === "agent" && <AgentManagement />}
          {active === "stats" && <StatsAnalytics />}
          {active === "global-msg" && <GlobalMessages />}
          {active === "settings" && <SystemSettings />}
          {active === "admin-mgmt" && <AdminManagement />}
        </main>
      </div>

      <AdminV1Styles />
    </div>
  );
}

/* ============================================================
   DASHBOARD OVERVIEW – command center
   ============================================================ */

function DashboardOverview({
  onJump,
  pendingReports,
}: {
  onJump: (s: SectionKey) => void;
  pendingReports: number;
}) {
  return (
    <div className="adm1-page">
      <PageHeader
        title="Dashboard Tổng quan"
        subtitle="Trung tâm chỉ huy website — thống kê thời gian thực"
        right={<LiveClock />}
      />

      {/* USER STATS */}
      <SectionTitle icon={Users} label="Thống kê người dùng" />
      <div className="adm1-grid adm1-grid-4">
        <StatCard label="Tổng người dùng" value="—" icon={Users} accent="#38bdf8" delta="+0%" />
        <StatCard label="Đăng ký hôm nay" value="—" icon={UserPlus} accent="#22d3ee" delta="+0%" />
        <StatCard label="Đăng ký hôm qua" value="—" icon={UserPlus} accent="#818cf8" />
        <StatCard label="Đăng ký tuần này" value="—" icon={TrendingUp} accent="#a78bfa" />
        <StatCard label="Đăng ký tháng này" value="—" icon={TrendingUp} accent="#f472b6" />
        <StatCard label="Quay lại hôm nay" value="—" icon={RefreshCw} accent="#34d399" />
        <StatCard label="Active hôm nay" value="—" icon={Activity} accent="#4ade80" />
        <StatCard label="Đang online" value="—" icon={Wifi} accent="#22c55e" live />
        <StatCard label="Không hoạt động 7d" value="—" icon={Clock} accent="#fbbf24" />
        <StatCard label="Không hoạt động 30d" value="—" icon={Clock} accent="#f97316" />
      </div>

      {/* ACTIVITY STATS */}
      <SectionTitle icon={Zap} label="Thống kê hoạt động" />
      <div className="adm1-grid adm1-grid-3">
        <ActivityCard label="Bài viết hôm nay" value="—" icon={FileText} accent="#38bdf8" yesterday="—" week="—" month="—" />
        <ActivityCard label="Bình luận hôm nay" value="—" icon={MessageCircle} accent="#a78bfa" yesterday="—" week="—" month="—" />
        <ActivityCard label="Lượt thích hôm nay" value="—" icon={Heart} accent="#f472b6" yesterday="—" week="—" month="—" />
        <ActivityCard label="Follower hôm nay" value="—" icon={UserPlus} accent="#22d3ee" yesterday="—" week="—" month="—" />
        <ActivityCard label="Kết bạn hôm nay" value="—" icon={Users} accent="#4ade80" yesterday="—" week="—" month="—" />
        <ActivityCard label="Báo cáo hôm nay" value={String(pendingReports || "—")} icon={Flag} accent="#ef4444" yesterday="—" week="—" month="—" />
      </div>

      {/* CHARTS */}
      <SectionTitle icon={BarChart3} label="Biểu đồ 30 ngày qua" />
      <div className="adm1-grid adm1-grid-2">
        <ChartCard title="Đăng ký hàng ngày" icon={UserPlus}>
          <PlaceholderArea color="#38bdf8" />
        </ChartCard>
        <ChartCard title="Người dùng online" icon={Wifi}>
          <PlaceholderLine color="#22c55e" />
        </ChartCard>
        <ChartCard title="Bài viết & Bình luận" icon={FileText}>
          <PlaceholderBars />
        </ChartCard>
        <ChartCard title="Giao dịch tiền" icon={DollarSign}>
          <PlaceholderArea color="#fbbf24" />
        </ChartCard>
      </div>

      {/* WEBSITE OVERVIEW */}
      <SectionTitle icon={Globe} label="Tổng quan website" />
      <div className="adm1-grid adm1-grid-3">
        <ListCard title="User hoạt động nhiều nhất" icon={Trophy} />
        <ListCard title="Bài xem nhiều nhất" icon={Eye} />
        <ListCard title="Bài được thích nhất" icon={Heart} />
        <ListCard title="Bài được bình luận nhiều" icon={MessageCircle} />
        <ListCard title="User trending" icon={TrendingUp} />
        <ListCard title="Chủ đề thịnh hành" icon={Star} />
      </div>

      {/* ONLINE USERS */}
      <SectionTitle icon={Wifi} label="Người dùng đang online" />
      <TableCard
        title="Live online sessions"
        headers={["", "User", "Trạng thái", "Đăng nhập", "Thời gian online", "Trang hiện tại", "Thiết bị", "Trình duyệt"]}
        emptyLabel="Chưa có dữ liệu online realtime."
      />

      {/* RETURNING + NEW */}
      <div className="adm1-grid adm1-grid-2">
        <ListCard title="User quay lại hôm nay" icon={RefreshCw} sub="Tạo trước hôm nay, đăng nhập hôm nay" />
        <ListCard title="User mới hôm nay" icon={UserPlus} sub="Tạo tài khoản trong hôm nay" />
      </div>

      {/* RECENT ACTIVITY */}
      <SectionTitle icon={Activity} label="Hoạt động gần đây" />
      <div className="adm1-timeline">
        {[
          "User đăng ký",
          "User đăng nhập",
          "User đăng bài",
          "User bình luận",
          "User follow",
          "User lên VIP",
          "User gửi quà",
          "User chuyển tiền",
          "User đổi hồ sơ",
        ].map((label) => (
          <div key={label} className="adm1-timeline-item">
            <div className="adm1-timeline-dot" />
            <div className="adm1-timeline-content">
              <div className="adm1-timeline-title">{label}</div>
              <div className="adm1-timeline-meta">Đang chờ kết nối realtime feed</div>
            </div>
            <div className="adm1-timeline-time">—</div>
          </div>
        ))}
      </div>

      {/* FINANCIAL OVERVIEW */}
      <SectionTitle icon={DollarSign} label="Tổng quan tài chính" />
      <div className="adm1-grid adm1-grid-4">
        <StatCard label="Chuyển tiền hôm nay" value="—" icon={Send} accent="#fbbf24" />
        <StatCard label="Chuyển tiền tuần này" value="—" icon={Send} accent="#f59e0b" />
        <StatCard label="Top người gửi" value="—" icon={ArrowUpRight} accent="#22d3ee" />
        <StatCard label="Top người nhận" value="—" icon={ArrowDownRight} accent="#a78bfa" />
        <StatCard label="Giao dịch lớn nhất" value="—" icon={Zap} accent="#ef4444" />
        <StatCard label="Mua VIP" value="—" icon={Crown} accent="#f472b6" />
        <StatCard label="Hoa hồng đại lý" value="—" icon={Briefcase} accent="#818cf8" />
        <StatCard label="Doanh thu" value="—" icon={DollarSign} accent="#22c55e" />
        <StatCard label="Yêu cầu rút" value="—" icon={ArrowUpRight} accent="#f97316" />
        <StatCard label="Yêu cầu nạp" value="—" icon={ArrowDownRight} accent="#34d399" />
      </div>

      {/* TOP RANKINGS */}
      <SectionTitle icon={Trophy} label="Bảng xếp hạng" />
      <div className="adm1-grid adm1-grid-4">
        <RankCard title="Top User Hoạt Động" icon={Activity} />
        <RankCard title="Top Chi Tiêu" icon={Coins} />
        <RankCard title="Top Kiếm Tiền" icon={DollarSign} />
        <RankCard title="Top Đăng Bài" icon={FileText} />
        <RankCard title="Top Bình Luận" icon={MessageCircle} />
        <RankCard title="Top Giới Thiệu" icon={UserPlus} />
        <RankCard title="Top Đại Lý" icon={Briefcase} />
        <RankCard title="Top VIP" icon={Crown} />
      </div>

      <AdminMasterReviewPanel />

      {/* QUICK JUMP */}
      <SectionTitle icon={LayoutDashboard} label="Truy cập nhanh" />
      <div className="adm1-quick-grid">
        {NAV.filter((n) => n.key !== "dashboard").map((n) => (
          <button key={n.key} className="adm1-quick-item" onClick={() => onJump(n.key)}>
            <n.icon size={17} />
            <span>{n.label}</span>
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   HOMEPAGE MANAGEMENT
   ============================================================ */
function HomeManager({ pendingReports }: { pendingReports: number }) {
  return (
    <SectionView
      title="Quản Lý Trang Chủ"
      subtitle="Bài viết · Báo cáo · Lịch sử tặng quà · Bot từ cấm"
      tabs={[
        { key: "posts", label: "Bài viết", icon: FileText, content: <HomePostsManager /> },
        {
          key: "reports",
          label: "Báo cáo",
          icon: Flag,
          badge: <ReportDot count={pendingReports} />,
          content: <ReportsManager />,
        },
        {
          key: "gifts",
          label: "🎁 Lịch sử tặng quà",
          icon: Pin,
          content: <GiftHistoryManager />,
        },
        {
          key: "keywords",
          label: "Bot từ cấm",
          icon: ShieldAlert,
          content: <KeywordManager />,
        },
      ]}
    />
  );
}

/* ============================================================
   ACCOUNT MANAGEMENT
   ============================================================ */
function AccountManagement() {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <SectionView
      title="Quản Lý Tài Khoản"
      subtitle="Trung tâm quản trị người dùng toàn diện"
      tabs={[
        {
          key: "new",
          label: "User mới",
          icon: UserPlus,
          content: <ComingSoon label="Danh sách user đăng ký hôm nay" />,
        },
        {
          key: "returning",
          label: "User quay lại",
          icon: RefreshCw,
          content: <ComingSoon label="User cũ đăng nhập lại hôm nay" />,
        },
        {
          key: "online",
          label: "Đang online",
          icon: Wifi,
          content: (
            <TableCard
              title="Người dùng online realtime"
              headers={["User", "Trạng thái", "Đăng nhập", "Online", "Trang", "Thiết bị"]}
              emptyLabel="Chưa có kết nối realtime."
            />
          ),
        },
        {
          key: "banned",
          label: "Bị khoá",
          icon: Ban,
          content: <ComingSoon label="User đang bị suspend / ban" />,
        },
        { key: "vip", label: "VIP", icon: Crown, content: <ComingSoon label="Danh sách VIP đang hoạt động" /> },
        { key: "top", label: "Top user", icon: Trophy, content: <ComingSoon label="Bảng xếp hạng user tổng hợp" /> },
        {
          key: "active",
          label: "Hoạt động gần đây",
          icon: Activity,
          content: <ComingSoon label="User tương tác trong 24-72h" />,
        },
        {
          key: "inactive",
          label: "Không hoạt động",
          icon: Clock,
          content: <ComingSoon label="User im lặng 7d / 30d" />,
        },
        {
          key: "search",
          label: "Tìm kiếm",
          icon: Search,
          content: (
            <>
              <FeatureGrid
                features={[
                  { label: "Tìm nhanh", desc: "Theo tên · SDT · ID · email", onAction: () => setSearchOpen(true) },
                  { label: "Bộ lọc nâng cao", desc: "Ngày · vùng · VIP · trạng thái" },
                  { label: "Xuất danh sách", desc: "CSV / Excel" },
                ]}
              />
              <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onViewProfile={() => setSearchOpen(false)} />
            </>
          ),
        },
        {
          key: "profile",
          label: "Hồ sơ chi tiết",
          icon: UserCog,
          content: (
            <FeatureGrid
              features={[
                { label: "Xem hồ sơ", desc: "Toàn bộ thông tin profile" },
                { label: "Chỉnh sửa", desc: "Đổi thông tin cơ bản" },
                { label: "Cấp / thu hồi VIP", desc: "Quản lý gói VIP" },
                { label: "Cộng / trừ Gem", desc: "Điều chỉnh số dư" },
                { label: "Cảnh cáo", desc: "Gửi cảnh cáo tới user" },
                { label: "Khoá / mở khoá", desc: "Tạm khoá hoặc vĩnh viễn" },
              ]}
            />
          ),
        },
        {
          key: "history-account",
          label: "Lịch sử tài khoản",
          icon: Clock,
          content: <ComingSoon label="Sự kiện quan trọng của tài khoản" />,
        },
        {
          key: "history-device",
          label: "Lịch sử thiết bị",
          icon: MonitorSmartphone,
          content: <ComingSoon label="Thiết bị đã đăng nhập, fingerprint" />,
        },
        {
          key: "history-login",
          label: "Lịch sử đăng nhập",
          icon: Lock,
          content: <ComingSoon label="IP · location · thời gian" />,
        },
        {
          key: "history-money",
          label: "Lịch sử tiền",
          icon: Wallet,
          content: <ComingSoon label="Chuyển / nhận / nạp / rút" />,
        },
        {
          key: "history-interaction",
          label: "Lịch sử tương tác",
          icon: Heart,
          content: <ComingSoon label="Like · comment · gift · view" />,
        },
        {
          key: "history-relations",
          label: "Lịch sử quan hệ",
          icon: Users,
          content: <ComingSoon label="Follow · bạn bè · block" />,
        },
      ]}
    />
  );
}

/* ============================================================
   NEARBY (giữ nguyên chức năng, chỉ UI wrapper)
   ============================================================ */
function NearbyManager() {
  return (
    <div className="adm1-page">
      <PageHeader
        title="Quản Lý Tìm Quanh Đây"
        subtitle="Clone & Flow Management · Quick-seed nick ảo · Admin interceptor"
      />
      <div className="adm1-tab-body">
        <NearbyCloneManager />
      </div>
    </div>
  );
}

/* ============================================================
   AGENT MANAGEMENT
   ============================================================ */
function AgentManagement() {
  return (
    <SectionView
      title="Quản Lý Đại Lý"
      subtitle="Danh sách · Hoa hồng · Chi trả · Doanh thu · Báo cáo"
      tabs={[
        {
          key: "list",
          label: "Danh sách đại lý",
          icon: Briefcase,
          content: (
            <TableCard
              title="Đại lý"
              headers={["Đại lý", "Trạng thái", "Cấp", "Doanh thu", "Hoa hồng", "Tham gia"]}
              emptyLabel="Chưa kết nối dữ liệu đại lý."
            />
          ),
        },
        { key: "commission-history", label: "Lịch sử hoa hồng", icon: Coins, content: <ComingSoon label="Toàn bộ giao dịch hoa hồng" /> },
        { key: "commission-pay", label: "Chi trả hoa hồng", icon: Wallet, content: <ComingSoon label="Duyệt & chi trả hoa hồng" /> },
        { key: "top", label: "Top đại lý", icon: Trophy, content: <ComingSoon label="Xếp hạng đại lý theo doanh thu" /> },
        { key: "revenue", label: "Doanh thu", icon: DollarSign, content: <ComingSoon label="Biểu đồ doanh thu theo đại lý" /> },
        { key: "monthly", label: "Báo cáo tháng", icon: BarChart3, content: <ComingSoon label="Báo cáo tổng hợp hàng tháng" /> },
      ]}
    />
  );
}

/* ============================================================
   STATS & ANALYTICS
   ============================================================ */
function StatsAnalytics() {
  return (
    <div className="adm1-page">
      <PageHeader title="Thống Kê & Phân Tích" subtitle="Số liệu chuyên sâu toàn hệ thống" />

      <SectionTitle icon={TrendingUp} label="Tăng trưởng người dùng" />
      <div className="adm1-grid adm1-grid-2">
        <ChartCard title="User growth (30d)" icon={UserPlus}><PlaceholderArea color="#38bdf8" /></ChartCard>
        <ChartCard title="Traffic (30d)" icon={Globe}><PlaceholderLine color="#a78bfa" /></ChartCard>
        <ChartCard title="Activity heatmap" icon={Activity}><PlaceholderBars /></ChartCard>
        <ChartCard title="Retention" icon={RefreshCw}><PlaceholderArea color="#22c55e" /></ChartCard>
      </div>

      <SectionTitle icon={Trophy} label="Top rankings" />
      <div className="adm1-grid adm1-grid-4">
        <RankCard title="Top active" icon={Activity} />
        <RankCard title="Top spenders" icon={Coins} />
        <RankCard title="Top earners" icon={DollarSign} />
        <RankCard title="Top posters" icon={FileText} />
      </div>

      <SectionTitle icon={DollarSign} label="Tài chính" />
      <div className="adm1-grid adm1-grid-4">
        <StatCard label="Doanh thu tháng" value="—" icon={DollarSign} accent="#22c55e" />
        <StatCard label="Chi hoa hồng" value="—" icon={Briefcase} accent="#f472b6" />
        <StatCard label="Nạp" value="—" icon={ArrowDownRight} accent="#38bdf8" />
        <StatCard label="Rút" value="—" icon={ArrowUpRight} accent="#f97316" />
      </div>

      <SectionTitle icon={BarChart3} label="Báo cáo tháng" />
      <div className="adm1-grid adm1-grid-2">
        <ChartCard title="Doanh thu 12 tháng" icon={DollarSign}><PlaceholderBars /></ChartCard>
        <ChartCard title="Người dùng active 12 tháng" icon={Users}><PlaceholderLine color="#22d3ee" /></ChartCard>
      </div>

      <SectionTitle icon={Zap} label="Hiệu năng hệ thống" />
      <div className="adm1-grid adm1-grid-4">
        <StatCard label="API latency" value="—" icon={Zap} accent="#22c55e" />
        <StatCard label="Error rate" value="—" icon={ShieldAlert} accent="#ef4444" />
        <StatCard label="DB CPU" value="—" icon={Activity} accent="#fbbf24" />
        <StatCard label="Uptime" value="—" icon={ShieldCheck} accent="#4ade80" />
      </div>
    </div>
  );
}

/* ============================================================
   GLOBAL MESSAGES – quản lý clone của admin
   ============================================================ */
function GlobalMessages() {
  return (
    <div className="adm1-page">
      <PageHeader
        title="Global Messages"
        subtitle="Trung tâm quản lý các tài khoản clone của admin & hội thoại"
      />

      <div className="adm1-gm-grid">
        {/* LEFT: clone accounts */}
        <div className="adm1-gm-col">
          <Card title="Clone accounts" icon={Users} action={<button className="adm1-btn-primary"><UserPlus size={13} /> Thêm clone</button>}>
            <div className="adm1-clone-list">
              {[1, 2, 3].map((i) => (
                <div key={i} className="adm1-clone-item">
                  <div className="adm1-avatar">
                    <span>C{i}</span>
                    <span className="adm1-status-dot" />
                  </div>
                  <div className="adm1-clone-meta">
                    <div className="adm1-clone-name">clone_user_{i}</div>
                    <div className="adm1-clone-sub">Nickname · online</div>
                  </div>
                  <div className="adm1-clone-actions">
                    <button className="adm1-mini-btn" title="Đăng nhập nhanh"><Zap size={12} /></button>
                    <button className="adm1-mini-btn" title="Mở chat"><MessageSquare size={12} /></button>
                  </div>
                </div>
              ))}
              <div className="adm1-empty-mini">Placeholder — chưa lưu clone thực tế.</div>
            </div>
          </Card>

          <Card title="Thêm clone mới" icon={UserPlus}>
            <div className="adm1-form">
              <input className="adm1-input" placeholder="Username" />
              <input className="adm1-input" placeholder="Password" type="password" />
              <input className="adm1-input" placeholder="Nickname hiển thị" />
              <select className="adm1-input">
                <option>Trạng thái: Active</option>
                <option>Trạng thái: Idle</option>
                <option>Trạng thái: Off</option>
              </select>
              <button className="adm1-btn-primary" disabled>Lưu (UI placeholder)</button>
            </div>
          </Card>
        </div>

        {/* RIGHT: conversation area */}
        <div className="adm1-gm-col">
          <Card title="Conversation list" icon={Inbox} action={<span className="adm1-badge">3 unread</span>}>
            <div className="adm1-conv-list">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="adm1-conv-item">
                  <div className="adm1-avatar"><span>U{i}</span></div>
                  <div className="adm1-conv-body">
                    <div className="adm1-conv-name">User {i}</div>
                    <div className="adm1-conv-preview">Placeholder tin nhắn gần nhất…</div>
                  </div>
                  <div className="adm1-conv-meta">
                    <span className="adm1-conv-time">—</span>
                    {i <= 2 && <span className="adm1-unread-dot">{i}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Recent chats" icon={MessageSquare}>
            <div className="adm1-empty-mini">Placeholder — chưa kết nối realtime.</div>
          </Card>

          <Card title="Quick account switcher" icon={RefreshCw}>
            <div className="adm1-switcher-row">
              {["C1", "C2", "C3", "C4"].map((c) => (
                <button key={c} className="adm1-switcher-item">
                  <div className="adm1-avatar adm1-avatar-sm"><span>{c}</span></div>
                  <span>{c}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SYSTEM SETTINGS
   ============================================================ */
function SystemSettings() {
  return (
    <SectionView
      title="Cài Đặt Hệ Thống"
      subtitle="Cấu hình toàn cục · Bảo mật · Tích hợp"
      tabs={[
        {
          key: "general",
          label: "Chung",
          icon: Settings,
          content: (
            <FeatureGrid
              features={[
                { label: "Thông tin website", desc: "Tên, mô tả, logo" },
                { label: "Ngôn ngữ mặc định", desc: "Locale toàn cục" },
                { label: "Múi giờ", desc: "Timezone hiển thị" },
              ]}
            />
          ),
        },
        {
          key: "security",
          label: "Bảo mật",
          icon: ShieldCheck,
          content: (
            <FeatureGrid
              features={[
                { label: "Rate limiting", desc: "Giới hạn request" },
                { label: "IP blacklist", desc: "Chặn IP đáng ngờ" },
                { label: "2FA cho admin", desc: "Bật xác thực 2 lớp" },
              ]}
            />
          ),
        },
        {
          key: "features",
          label: "Tính năng",
          icon: Zap,
          content: (
            <FeatureGrid
              features={[
                { label: "Bật / tắt module", desc: "Live, Game, Nearby…" },
                { label: "Chế độ bảo trì", desc: "Maintenance mode" },
                { label: "Feature flags", desc: "Rollout theo cohort" },
              ]}
            />
          ),
        },
        {
          key: "integrations",
          label: "Tích hợp",
          icon: Globe,
          content: (
            <FeatureGrid
              features={[
                { label: "Cổng thanh toán", desc: "VNPay / Momo / Stripe" },
                { label: "SMS / Email", desc: "Provider gửi tin" },
                { label: "Analytics", desc: "GA / Mixpanel" },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

/* ============================================================
   ADMIN MANAGEMENT
   ============================================================ */
function AdminManagement() {
  return (
    <SectionView
      title="Quản Lý Admin"
      subtitle="Bang chủ · Admin 2 · Agent — phân quyền & duyệt"
      tabs={[
        {
          key: "list",
          label: "Danh sách admin",
          icon: UserCog,
          content: (
            <TableCard
              title="Admin accounts"
              headers={["Admin", "Role", "Trạng thái", "Đăng nhập gần nhất", "Hành động"]}
              emptyLabel="Chưa hiển thị dữ liệu — kết nối bảng bangchu."
            />
          ),
        },
        { key: "approvals", label: "Duyệt đăng ký", icon: ShieldCheck, content: <ComingSoon label="Duyệt Admin 2 / Agent chờ phê duyệt" /> },
        { key: "roles", label: "Phân quyền", icon: Lock, content: <ComingSoon label="Ma trận role & permission" /> },
        { key: "audit", label: "Nhật ký admin", icon: FileText, content: <ComingSoon label="Audit log toàn bộ hành động admin" /> },
      ]}
    />
  );
}

/* ============================================================
   SHARED PIECES
   ============================================================ */

function SectionView({
  title,
  subtitle,
  tabs,
}: {
  title: string;
  subtitle?: string;
  tabs: { key: string; label: string; icon: any; content: ReactNode; badge?: ReactNode }[];
}) {
  const [tab, setTab] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === tab) || tabs[0];

  return (
    <div className="adm1-page">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="adm1-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`adm1-tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={14} />
            {t.label}
            {t.badge ?? null}
          </button>
        ))}
      </div>
      <div className="adm1-tab-body">{active?.content}</div>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="adm1-pageheader">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right && <div className="adm1-pageheader-right">{right}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="adm1-section-title">
      <Icon size={14} />
      <span>{label}</span>
      <span className="adm1-section-line" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  delta,
  live,
}: {
  label: string;
  value: string;
  icon: any;
  accent: string;
  delta?: string;
  live?: boolean;
}) {
  return (
    <div className="adm1-stat-card" style={{ ["--stat-accent" as any]: accent }}>
      <div className="adm1-stat-top">
        <div className="adm1-stat-icon"><Icon size={15} /></div>
        {live && <span className="adm1-live-badge"><span className="adm1-live-dot" /> LIVE</span>}
      </div>
      <div className="adm1-stat-label">{label}</div>
      <div className="adm1-stat-value">{value}</div>
      {delta && <div className="adm1-stat-delta">{delta}</div>}
    </div>
  );
}

function ActivityCard({
  label,
  value,
  icon: Icon,
  accent,
  yesterday,
  week,
  month,
}: {
  label: string;
  value: string;
  icon: any;
  accent: string;
  yesterday: string;
  week: string;
  month: string;
}) {
  return (
    <div className="adm1-activity-card" style={{ ["--stat-accent" as any]: accent }}>
      <div className="adm1-stat-top">
        <div className="adm1-stat-icon"><Icon size={15} /></div>
        <span className="adm1-badge-muted">Hôm nay</span>
      </div>
      <div className="adm1-stat-label">{label}</div>
      <div className="adm1-stat-value">{value}</div>
      <div className="adm1-compare-row">
        <div><span>Hôm qua</span><b>{yesterday}</b></div>
        <div><span>Tuần trước</span><b>{week}</b></div>
        <div><span>Tháng trước</span><b>{month}</b></div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="adm1-card">
      <div className="adm1-card-head">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <div className="adm1-card-body" style={{ height: 240 }}>{children}</div>
    </div>
  );
}

function ListCard({ title, icon: Icon, sub }: { title: string; icon: any; sub?: string }) {
  return (
    <div className="adm1-card">
      <div className="adm1-card-head">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <div className="adm1-card-body">
        {sub && <div className="adm1-list-sub">{sub}</div>}
        <div className="adm1-list-empty">
          {[1, 2, 3].map((i) => (
            <div key={i} className="adm1-list-row-skel">
              <div className="adm1-skel-avatar" />
              <div className="adm1-skel-lines">
                <div className="adm1-skel-line" />
                <div className="adm1-skel-line adm1-skel-line-sm" />
              </div>
              <div className="adm1-skel-badge" />
            </div>
          ))}
          <div className="adm1-empty-mini">Placeholder — chờ dữ liệu.</div>
        </div>
      </div>
    </div>
  );
}

function RankCard({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="adm1-card adm1-rank-card">
      <div className="adm1-card-head">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <div className="adm1-card-body">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="adm1-rank-row">
            <span className={`adm1-rank-num adm1-rank-${i}`}>#{i}</span>
            <div className="adm1-avatar adm1-avatar-sm"><span>—</span></div>
            <div className="adm1-rank-body">
              <div className="adm1-rank-name">—</div>
              <div className="adm1-rank-sub">chờ dữ liệu</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableCard({
  title,
  headers,
  emptyLabel,
}: {
  title: string;
  headers: string[];
  emptyLabel: string;
}) {
  return (
    <div className="adm1-card">
      <div className="adm1-card-head">
        <span>{title}</span>
      </div>
      <div className="adm1-table-wrap">
        <table className="adm1-table">
          <thead>
            <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4].map((i) => (
              <tr key={i}>
                {headers.map((_, idx) => (
                  <td key={idx}>
                    {idx === 0 ? <div className="adm1-skel-avatar" /> : <div className="adm1-skel-line" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="adm1-empty-mini">{emptyLabel}</div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon?: any;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="adm1-card">
      <div className="adm1-card-head">
        {Icon && <Icon size={14} />}
        <span>{title}</span>
        {action && <div className="adm1-card-action">{action}</div>}
      </div>
      <div className="adm1-card-body">{children}</div>
    </div>
  );
}

function FeatureGrid({ features }: { features: { label: string; desc: string; onAction?: () => void }[] }) {
  return (
    <div className="adm1-feature-grid">
      {features.map((f) => (
        <button key={f.label} className="adm1-feature-card" onClick={f.onAction} type="button">
          <div className="adm1-feature-title">{f.label}</div>
          <div className="adm1-feature-desc">{f.desc}</div>
        </button>
      ))}
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="adm1-empty">
      <ShieldCheck size={22} />
      <div className="adm1-empty-title">UI sẵn sàng — chờ kết nối dữ liệu</div>
      <div className="adm1-empty-desc">{label}</div>
    </div>
  );
}

function LiveClock() {
  return (
    <div className="adm1-live-clock">
      <span className="adm1-live-dot" />
      <span>LIVE · {new Date().toLocaleDateString("vi-VN")}</span>
    </div>
  );
}

/* ============================================================
   PLACEHOLDER CHARTS (mock data)
   ============================================================ */

const MOCK_30 = Array.from({ length: 30 }, (_, i) => ({
  d: `${i + 1}`,
  v: Math.round(30 + Math.sin(i / 3) * 15 + Math.random() * 20),
  v2: Math.round(20 + Math.cos(i / 4) * 12 + Math.random() * 18),
}));

const CHART_TOOLTIP = {
  contentStyle: {
    background: "rgba(11,14,20,0.95)",
    border: "1px solid rgba(56,189,248,0.35)",
    borderRadius: 8,
    fontSize: 12,
    color: "#e2e8f0",
  } as React.CSSProperties,
  labelStyle: { color: "#94a3b8" } as React.CSSProperties,
};

function PlaceholderArea({ color }: { color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={MOCK_30} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={`ga-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="d" tick={{ fill: "#64748b", fontSize: 10 }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP} />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#ga-${color})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PlaceholderLine({ color }: { color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={MOCK_30} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="d" tick={{ fill: "#64748b", fontSize: 10 }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="v2" stroke="#a78bfa" strokeWidth={2} dot={false} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PlaceholderBars() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={MOCK_30} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="d" tick={{ fill: "#64748b", fontSize: 10 }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
        <Tooltip {...CHART_TOOLTIP} />
        <Bar dataKey="v" fill="#38bdf8" radius={[3, 3, 0, 0]} />
        <Bar dataKey="v2" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

function AdminV1Styles() {
  return (
    <style>{`
:root {
  --adm1-bg: #060912;
  --adm1-bg-2: #0a0f1c;
  --adm1-surface: rgba(17, 24, 39, 0.55);
  --adm1-surface-solid: #0f172a;
  --adm1-border: rgba(56, 189, 248, 0.12);
  --adm1-border-strong: rgba(56, 189, 248, 0.28);
  --adm1-text: #e2e8f0;
  --adm1-text-dim: #94a3b8;
  --adm1-text-mute: #64748b;
  --adm1-accent: #38bdf8;
  --adm1-accent-2: #22d3ee;
  --adm1-danger: #ef4444;
  --adm1-good: #22c55e;
  --adm1-warn: #fbbf24;
}

.adm1-root {
  min-height: 100vh;
  background: var(--adm1-bg);
  color: var(--adm1-text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: flex;
  position: relative;
  overflow-x: hidden;
}

.adm1-bg-grid {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 50% 30%, #000 40%, transparent 90%);
}
.adm1-bg-glow {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(600px circle at 15% 10%, rgba(56,189,248,0.10), transparent 60%),
    radial-gradient(500px circle at 85% 90%, rgba(34,211,238,0.08), transparent 60%);
}

/* SIDEBAR */
.adm1-sidebar {
  position: sticky; top: 0; align-self: flex-start;
  height: 100vh;
  width: 268px; flex-shrink: 0;
  background: linear-gradient(180deg, rgba(10,15,28,0.9), rgba(6,9,18,0.95));
  border-right: 1px solid var(--adm1-border);
  display: flex; flex-direction: column;
  backdrop-filter: blur(14px);
  z-index: 20;
}
.adm1-sidebar-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--adm1-border);
}
.adm1-brand-mark {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, #0369a1, #22d3ee);
  color: #fff; display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(34,211,238,0.45);
}
.adm1-brand-title { font-weight: 900; letter-spacing: 0.14em; font-size: 0.78rem; color: #fff; }
.adm1-brand-sub { font-size: 0.65rem; color: var(--adm1-text-dim); letter-spacing: 0.05em; text-transform: uppercase; }
.adm1-sidebar-close { display: none; margin-left: auto; }

.adm1-sidebar-user {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--adm1-border);
}
.adm1-userinfo { line-height: 1.25; min-width: 0; }
.adm1-username { font-weight: 700; font-size: 0.85rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm1-userrole { font-size: 0.66rem; color: var(--adm1-accent-2); text-transform: uppercase; letter-spacing: 0.06em; display: inline-flex; align-items: center; gap: 4px; }

.adm1-avatar {
  position: relative;
  width: 38px; height: 38px; border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #0369a1, #22d3ee);
  color: #fff; display: inline-flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
  box-shadow: 0 0 12px rgba(56,189,248,0.25);
}
.adm1-avatar img { width: 100%; height: 100%; object-fit: cover; }
.adm1-avatar-sm { width: 26px; height: 26px; font-size: 0.7rem; }
.adm1-status-dot {
  position: absolute; bottom: 0; right: 0;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--adm1-good);
  border: 2px solid var(--adm1-bg-2);
  box-shadow: 0 0 6px var(--adm1-good);
}

.adm1-sidebar-nav {
  flex: 1; overflow-y: auto;
  padding: 12px 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.adm1-nav-label {
  font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--adm1-text-mute); padding: 4px 10px 6px;
}
.adm1-side-item {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 9px;
  background: transparent; border: 1px solid transparent;
  color: var(--adm1-text-dim); font-size: 0.85rem; font-weight: 600;
  cursor: pointer; text-align: left;
  position: relative;
  transition: all 0.15s ease;
}
.adm1-side-item > span:first-of-type { flex: 1; }
.adm1-side-caret { opacity: 0; transition: opacity 0.15s; color: var(--adm1-accent); }
.adm1-side-item:hover { color: #fff; background: rgba(56,189,248,0.06); border-color: var(--adm1-border); }
.adm1-side-item:hover .adm1-side-caret { opacity: 1; }
.adm1-side-item.is-active {
  color: #fff;
  background: linear-gradient(135deg, rgba(56,189,248,0.18), rgba(34,211,238,0.08));
  border-color: var(--adm1-border-strong);
  box-shadow: 0 0 22px rgba(56,189,248,0.15), inset 0 0 0 1px rgba(56,189,248,0.15);
}
.adm1-side-item.is-active::before {
  content: ""; position: absolute; left: -10px; top: 8px; bottom: 8px;
  width: 3px; border-radius: 2px;
  background: linear-gradient(180deg, var(--adm1-accent), var(--adm1-accent-2));
  box-shadow: 0 0 10px var(--adm1-accent);
}
.adm1-side-item.is-active .adm1-side-caret { opacity: 1; }
.adm1-side-back { color: var(--adm1-warn); }
.adm1-side-back:hover { background: rgba(251,191,36,0.08); }
.adm1-side-danger { color: #fca5a5; }
.adm1-side-danger:hover { background: rgba(239,68,68,0.1); }

.adm1-sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--adm1-border);
  display: flex; flex-direction: column; gap: 6px;
}
.adm1-sys-row { display: inline-flex; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--adm1-text-dim); }
.adm1-sys-muted { color: var(--adm1-text-mute); }
.adm1-sys-dot { width: 8px; height: 8px; border-radius: 50%; }
.adm1-sys-dot-good { background: var(--adm1-good); box-shadow: 0 0 8px var(--adm1-good); animation: adm1-pulse 2s ease-in-out infinite; }
@keyframes adm1-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

/* COLUMN */
.adm1-column { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; z-index: 1; }

/* TOPBAR */
.adm1-topbar {
  position: sticky; top: 0; z-index: 15;
  display: flex; align-items: center; gap: 14px;
  padding: 12px 22px;
  background: rgba(6,9,18,0.7);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--adm1-border);
}
.adm1-hamburger { display: none; background: transparent; color: var(--adm1-text); border: 1px solid var(--adm1-border); border-radius: 8px; padding: 7px; cursor: pointer; }
.adm1-breadcrumb { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; }
.adm1-crumb-muted { color: var(--adm1-text-mute); }
.adm1-crumb-current { color: #fff; font-weight: 700; }
.adm1-topbar-tools { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.adm1-search {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 12px; border-radius: 10px;
  background: rgba(56,189,248,0.05);
  border: 1px solid var(--adm1-border);
  color: var(--adm1-text-dim);
  min-width: 320px;
}
.adm1-search input {
  flex: 1; background: transparent; border: 0; outline: none; color: #fff; font-size: 0.85rem;
}
.adm1-search kbd {
  font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;
  background: rgba(255,255,255,0.06); color: var(--adm1-text-dim);
  border: 1px solid var(--adm1-border);
}
.adm1-back-site {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  background: rgba(251,191,36,0.12);
  border: 1px solid rgba(251,191,36,0.3);
  color: var(--adm1-warn);
  font-weight: 700; font-size: 0.78rem; cursor: pointer;
}
.adm1-back-site:hover { background: rgba(251,191,36,0.2); }
.adm1-icon-btn { background: transparent; border: 1px solid var(--adm1-border); color: var(--adm1-text-dim); padding: 6px 8px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.adm1-icon-btn:hover { color: #fff; border-color: var(--adm1-border-strong); }

.adm1-report-dot {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: #ef4444; color: #fff; font-size: 0.68rem; font-weight: 800;
  box-shadow: 0 0 8px rgba(239,68,68,0.5);
}

/* MAIN */
.adm1-main { padding: 22px 22px 60px; max-width: 1500px; width: 100%; margin: 0 auto; }
.adm1-page { display: flex; flex-direction: column; gap: 18px; }
.adm1-pageheader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.adm1-pageheader h1 { font-size: 1.5rem; font-weight: 800; margin: 0; color: #fff; letter-spacing: -0.01em; }
.adm1-pageheader p { margin: 4px 0 0; color: var(--adm1-text-dim); font-size: 0.86rem; }
.adm1-pageheader-right { flex-shrink: 0; }

.adm1-live-clock {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 12px; border-radius: 8px;
  background: rgba(34,197,94,0.08);
  border: 1px solid rgba(34,197,94,0.3);
  font-size: 0.75rem; font-weight: 700; color: var(--adm1-good);
  letter-spacing: 0.05em;
}
.adm1-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--adm1-good); box-shadow: 0 0 8px var(--adm1-good); animation: adm1-pulse 1.5s infinite; }
.adm1-live-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.62rem; font-weight: 800; color: var(--adm1-good); letter-spacing: 0.1em; }

/* SECTION TITLE */
.adm1-section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.78rem; font-weight: 700;
  color: var(--adm1-accent-2);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-top: 4px;
}
.adm1-section-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--adm1-border-strong), transparent); }

/* GRID */
.adm1-grid { display: grid; gap: 12px; }
.adm1-grid-2 { grid-template-columns: repeat(1, minmax(0,1fr)); }
.adm1-grid-3 { grid-template-columns: repeat(1, minmax(0,1fr)); }
.adm1-grid-4 { grid-template-columns: repeat(2, minmax(0,1fr)); }
@media (min-width: 640px) { .adm1-grid-3, .adm1-grid-4 { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (min-width: 900px) { .adm1-grid-2 { grid-template-columns: repeat(2, minmax(0,1fr)); } .adm1-grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)); } .adm1-grid-4 { grid-template-columns: repeat(4, minmax(0,1fr)); } }
@media (min-width: 1280px) { .adm1-grid-4 { grid-template-columns: repeat(5, minmax(0,1fr)); } }

/* STAT CARD */
.adm1-stat-card, .adm1-activity-card {
  padding: 14px;
  border-radius: 14px;
  background: var(--adm1-surface);
  border: 1px solid var(--adm1-border);
  position: relative;
  backdrop-filter: blur(10px);
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.adm1-stat-card:hover, .adm1-activity-card:hover {
  transform: translateY(-2px);
  border-color: var(--stat-accent, var(--adm1-accent));
  box-shadow: 0 0 22px color-mix(in oklab, var(--stat-accent, var(--adm1-accent)) 22%, transparent);
}
.adm1-stat-card::after, .adm1-activity-card::after {
  content: ""; position: absolute; top: 0; right: 0; width: 80px; height: 80px;
  background: radial-gradient(circle, color-mix(in oklab, var(--stat-accent, var(--adm1-accent)) 18%, transparent), transparent 70%);
  pointer-events: none;
}
.adm1-stat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.adm1-stat-icon {
  width: 32px; height: 32px; border-radius: 9px;
  background: color-mix(in oklab, var(--stat-accent, var(--adm1-accent)) 15%, transparent);
  border: 1px solid color-mix(in oklab, var(--stat-accent, var(--adm1-accent)) 35%, transparent);
  color: var(--stat-accent, var(--adm1-accent));
  display: inline-flex; align-items: center; justify-content: center;
}
.adm1-stat-label { font-size: 0.7rem; color: var(--adm1-text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.adm1-stat-value { font-size: 1.6rem; font-weight: 800; color: #fff; margin-top: 3px; letter-spacing: -0.01em; }
.adm1-stat-delta { font-size: 0.72rem; color: var(--adm1-good); font-weight: 700; margin-top: 4px; }

.adm1-badge-muted { font-size: 0.62rem; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--adm1-text-dim); font-weight: 600; }
.adm1-compare-row {
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--adm1-border);
  display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px;
  font-size: 0.68rem;
}
.adm1-compare-row > div { display: flex; flex-direction: column; gap: 2px; }
.adm1-compare-row span { color: var(--adm1-text-mute); }
.adm1-compare-row b { color: #fff; font-weight: 700; }

/* CARD */
.adm1-card {
  background: var(--adm1-surface);
  border: 1px solid var(--adm1-border);
  border-radius: 14px;
  backdrop-filter: blur(10px);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.adm1-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--adm1-border);
  font-weight: 700; font-size: 0.86rem; color: #fff;
  background: rgba(56,189,248,0.03);
}
.adm1-card-head > span:first-of-type { flex: 1; }
.adm1-card-action { margin-left: auto; }
.adm1-card-body { padding: 14px; flex: 1; }

.adm1-badge { font-size: 0.68rem; padding: 3px 8px; border-radius: 999px; background: rgba(56,189,248,0.15); color: var(--adm1-accent); font-weight: 700; border: 1px solid rgba(56,189,248,0.3); }

/* TABS */
.adm1-tabs {
  display: flex; gap: 4px; overflow-x: auto;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--adm1-border);
}
.adm1-tabs::-webkit-scrollbar { display: none; }
.adm1-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border: 0; background: transparent;
  color: var(--adm1-text-dim); font-size: 0.8rem; font-weight: 600;
  cursor: pointer; border-radius: 8px 8px 0 0;
  white-space: nowrap; position: relative;
}
.adm1-tab:hover { color: var(--adm1-text); }
.adm1-tab.is-active { color: #fff; }
.adm1-tab.is-active::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: -7px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--adm1-accent), var(--adm1-accent-2));
  box-shadow: 0 0 8px var(--adm1-accent);
}
.adm1-tab-body { padding-top: 14px; }

/* FEATURE GRID */
.adm1-feature-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(1, minmax(0,1fr));
}
@media (min-width: 640px) { .adm1-feature-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (min-width: 1024px) { .adm1-feature-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
.adm1-feature-card {
  text-align: left; padding: 14px; border-radius: 12px;
  background: var(--adm1-surface); border: 1px solid var(--adm1-border);
  cursor: pointer; transition: all 0.15s ease; color: var(--adm1-text);
  backdrop-filter: blur(8px);
}
.adm1-feature-card:hover { border-color: var(--adm1-accent); transform: translateY(-2px); box-shadow: 0 0 20px rgba(56,189,248,0.18); }
.adm1-feature-title { font-weight: 700; font-size: 0.92rem; color: #fff; margin-bottom: 4px; }
.adm1-feature-desc { font-size: 0.76rem; color: var(--adm1-text-dim); }

/* QUICK GRID */
.adm1-quick-grid { display: grid; grid-template-columns: repeat(1, minmax(0,1fr)); gap: 8px; }
@media (min-width: 640px) { .adm1-quick-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (min-width: 1024px) { .adm1-quick-grid { grid-template-columns: repeat(4, minmax(0,1fr)); } }
.adm1-quick-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 10px;
  background: var(--adm1-surface); border: 1px solid var(--adm1-border);
  color: var(--adm1-text); cursor: pointer;
  font-weight: 600; font-size: 0.85rem; text-align: left;
  transition: all 0.15s;
}
.adm1-quick-item > span { flex: 1; }
.adm1-quick-item:hover { border-color: var(--adm1-accent); background: rgba(56,189,248,0.08); color: #fff; }

/* TIMELINE */
.adm1-timeline {
  display: flex; flex-direction: column;
  background: var(--adm1-surface); border: 1px solid var(--adm1-border);
  border-radius: 14px; overflow: hidden;
  backdrop-filter: blur(10px);
}
.adm1-timeline-item {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--adm1-border);
  position: relative;
}
.adm1-timeline-item:last-child { border-bottom: 0; }
.adm1-timeline-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--adm1-accent);
  box-shadow: 0 0 10px var(--adm1-accent);
  flex-shrink: 0;
}
.adm1-timeline-content { flex: 1; min-width: 0; }
.adm1-timeline-title { font-size: 0.88rem; font-weight: 600; color: #fff; }
.adm1-timeline-meta { font-size: 0.72rem; color: var(--adm1-text-mute); }
.adm1-timeline-time { font-size: 0.75rem; color: var(--adm1-text-dim); font-variant-numeric: tabular-nums; }

/* TABLE */
.adm1-table-wrap { overflow-x: auto; }
.adm1-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.83rem;
}
.adm1-table th, .adm1-table td {
  padding: 11px 14px; text-align: left;
  border-bottom: 1px solid var(--adm1-border);
}
.adm1-table th {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--adm1-text-mute); font-weight: 700;
  background: rgba(56,189,248,0.03);
}
.adm1-table tbody tr:hover { background: rgba(56,189,248,0.04); }

/* LIST */
.adm1-list-sub { font-size: 0.75rem; color: var(--adm1-text-mute); margin-bottom: 10px; }
.adm1-list-row-skel { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--adm1-border); }
.adm1-list-row-skel:last-child { border-bottom: 0; }
.adm1-skel-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(90deg, rgba(56,189,248,0.06), rgba(56,189,248,0.14), rgba(56,189,248,0.06)); background-size: 200% 100%; animation: adm1-shimmer 1.6s infinite; }
.adm1-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.adm1-skel-line { height: 10px; border-radius: 4px; background: linear-gradient(90deg, rgba(56,189,248,0.06), rgba(56,189,248,0.14), rgba(56,189,248,0.06)); background-size: 200% 100%; animation: adm1-shimmer 1.6s infinite; }
.adm1-skel-line-sm { width: 60%; }
.adm1-skel-badge { width: 40px; height: 22px; border-radius: 999px; background: rgba(56,189,248,0.06); }
@keyframes adm1-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* RANK */
.adm1-rank-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.adm1-rank-num { font-weight: 900; font-size: 0.85rem; color: var(--adm1-text-mute); width: 32px; }
.adm1-rank-1 { color: #fbbf24; text-shadow: 0 0 8px rgba(251,191,36,0.5); }
.adm1-rank-2 { color: #cbd5e1; }
.adm1-rank-3 { color: #f59e0b; }
.adm1-rank-body { flex: 1; }
.adm1-rank-name { font-size: 0.85rem; color: #fff; font-weight: 600; }
.adm1-rank-sub { font-size: 0.7rem; color: var(--adm1-text-mute); }

/* EMPTY */
.adm1-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 46px 20px;
  border: 1px dashed var(--adm1-border);
  border-radius: 14px;
  color: var(--adm1-text-dim); text-align: center;
  background: rgba(56,189,248,0.02);
}
.adm1-empty-title { font-weight: 700; color: #fff; font-size: 0.95rem; }
.adm1-empty-desc { font-size: 0.8rem; }
.adm1-empty-mini { padding: 12px; text-align: center; color: var(--adm1-text-mute); font-size: 0.78rem; }

/* GLOBAL MSG */
.adm1-gm-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 1024px) { .adm1-gm-grid { grid-template-columns: 1fr 1.3fr; } }
.adm1-gm-col { display: flex; flex-direction: column; gap: 14px; }
.adm1-clone-list, .adm1-conv-list { display: flex; flex-direction: column; gap: 6px; }
.adm1-clone-item, .adm1-conv-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 10px;
  background: rgba(56,189,248,0.04);
  border: 1px solid var(--adm1-border);
}
.adm1-clone-item:hover, .adm1-conv-item:hover { border-color: var(--adm1-accent); }
.adm1-clone-meta, .adm1-conv-body { flex: 1; min-width: 0; }
.adm1-clone-name, .adm1-conv-name { font-weight: 700; font-size: 0.85rem; color: #fff; }
.adm1-clone-sub, .adm1-conv-preview { font-size: 0.72rem; color: var(--adm1-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm1-clone-actions { display: flex; gap: 4px; }
.adm1-mini-btn { padding: 6px; border-radius: 6px; background: rgba(56,189,248,0.1); border: 1px solid var(--adm1-border); color: var(--adm1-accent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.adm1-mini-btn:hover { background: rgba(56,189,248,0.2); }
.adm1-conv-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.adm1-conv-time { font-size: 0.7rem; color: var(--adm1-text-mute); }
.adm1-unread-dot { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--adm1-accent); color: #001018; font-weight: 800; font-size: 0.68rem; display: inline-flex; align-items: center; justify-content: center; }
.adm1-switcher-row { display: flex; gap: 8px; flex-wrap: wrap; }
.adm1-switcher-item { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(56,189,248,0.06); border: 1px solid var(--adm1-border); color: var(--adm1-text); font-size: 0.78rem; cursor: pointer; }
.adm1-switcher-item:hover { border-color: var(--adm1-accent); }

/* FORMS */
.adm1-form { display: flex; flex-direction: column; gap: 8px; }
.adm1-input {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  background: rgba(6,9,18,0.6); border: 1px solid var(--adm1-border);
  color: #fff; font-size: 0.85rem; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.adm1-input:focus { border-color: var(--adm1-accent); box-shadow: 0 0 0 3px rgba(56,189,248,0.15); }

.adm1-btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 14px; border-radius: 8px;
  background: linear-gradient(135deg, var(--adm1-accent), var(--adm1-accent-2));
  color: #001018; border: 0; font-weight: 800; font-size: 0.82rem;
  cursor: pointer; box-shadow: 0 0 16px rgba(56,189,248,0.35);
}
.adm1-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 22px rgba(56,189,248,0.55); }
.adm1-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* MOBILE */
.adm1-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 40; backdrop-filter: blur(4px); }
@media (max-width: 1023px) {
  .adm1-sidebar {
    position: fixed; top: 0; left: 0; bottom: 0; height: 100vh;
    z-index: 50; transform: translateX(-100%);
    transition: transform 0.2s ease;
    width: 280px;
  }
  .adm1-sidebar.is-open { transform: translateX(0); }
  .adm1-sidebar-close { display: inline-flex; }
  .adm1-hamburger { display: inline-flex; }
  .adm1-search { display: none; }
  .adm1-main { padding: 16px; }
}
@media (max-width: 640px) {
  .adm1-back-site span { display: none; }
  .adm1-back-site { padding: 7px 9px; }
  .adm1-topbar { padding: 10px 14px; gap: 10px; }
}
`}</style>
  );
}
