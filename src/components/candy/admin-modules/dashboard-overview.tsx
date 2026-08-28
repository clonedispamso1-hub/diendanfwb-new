import { useEffect, useState } from "react";
import { ModuleShell, StatCard } from "./module-shell";
import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";

export function DashboardOverview() {
  const [stats, setStats] = useState({ users: 0, posts: 0, reports: 0, newToday: 0 });
  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const [{ count: users }, { count: posts }, rp1, rp2, rp3] = await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }),
        read3().from("posts").select("id", { count: "exact", head: true }),
        sb.from("reports").select("id", { count: "exact", head: true }).eq("report_type", "post").eq("status", "pending"),
        sb.from("reports").select("id", { count: "exact", head: true }).eq("report_type", "profile").eq("status", "pending"),
        sb.from("reports").select("id", { count: "exact", head: true }).eq("report_type", "message").eq("status", "pending"),
      ]);
      const reports = (rp1.count || 0) + (rp2.count || 0) + (rp3.count || 0);
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count: newToday } = await sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since);
      setStats({ users: users || 0, posts: posts || 0, reports, newToday: newToday || 0 });
    })();
  }, []);
  return (
    <ModuleShell title="Dashboard Tổng quan" subtitle="Chỉ số realtime hệ thống">
      <div className="adm-stats-grid">
        <StatCard label="Tổng user" value={stats.users.toLocaleString()} tone="good" />
        <StatCard label="User mới 24h" value={stats.newToday.toLocaleString()} tone="good" />
        <StatCard label="Tổng bài đăng" value={stats.posts.toLocaleString()} />
        <StatCard label="Report chờ xử lý" value={stats.reports.toLocaleString()} tone={stats.reports > 0 ? "warn" : "good"} />
        <StatCard label="Tin nhắn/phút" value="—" hint="Cần realtime feed" />
        <StatCard label="Acc nghi bot" value="—" hint="AI risk score" />
        <StatCard label="Doanh thu gem 24h" value="—" hint="Cần bảng gem_tx" />
        <StatCard label="Tỉ lệ Premium" value="—" hint="Conversion rate" />
      </div>
      <p className="adm-empty" style={{ marginTop: 16 }}>
        Heatmap giờ cao điểm, biểu đồ DAU/MAU, top creator/whale… sẽ hiển thị tại đây khi đủ dữ liệu thống kê.
      </p>
    </ModuleShell>
  );
}
