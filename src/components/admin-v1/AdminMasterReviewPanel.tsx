import { useEffect, useState } from "react";
import { Users2, Facebook, MessageCircle, Globe, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tổng hợp báo cáo của các Admin 2 (Agent) trong ngày để Bang Chủ (Admin 1) xem nhanh.
 * Nguồn dữ liệu:
 *  - agent_fb_accounts  (mỗi dòng = một nick Facebook trong ngày)
 *  - agent_activity_logs (cột zalo_members_count)
 *  - profiles            (đếm thành viên website)
 */
export function AdminMasterReviewPanel() {
  const [loading, setLoading] = useState(true);
  const [activeFb, setActiveFb] = useState(0);
  const [postsToday, setPostsToday] = useState(0);
  const [zaloToday, setZaloToday] = useState(0);
  const [websiteToday, setWebsiteToday] = useState(0);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = `${today}T00:00:00.000Z`;

    const [fbRes, logRes, webRes] = await Promise.all([
      (supabase as any)
        .from("agent_fb_accounts")
        .select("status, posts_today")
        .eq("report_date", today),
      (supabase as any)
        .from("agent_activity_logs")
        .select("zalo_members_count")
        .eq("report_date", today),
      (supabase as any)
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfDay),
    ]);

    const fbRows = (fbRes.data ?? []) as { status: string; posts_today: number }[];
    setActiveFb(fbRows.filter((r) => r.status === "live").length);
    setPostsToday(fbRows.reduce((s, r) => s + (r.posts_today || 0), 0));

    const logRows = (logRes.data ?? []) as { zalo_members_count: number }[];
    setZaloToday(logRows.reduce((s, r) => s + (r.zalo_members_count || 0), 0));

    setWebsiteToday(webRes.count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const items = [
    { label: "Tổng nick FB hoạt động hôm nay", value: activeFb, icon: Facebook, accent: "#60a5fa" },
    { label: "Số bài FB đã chạy hôm nay",       value: postsToday, icon: Facebook, accent: "#a78bfa" },
    { label: "Thành viên Zalo kéo được hôm nay", value: zaloToday, icon: MessageCircle, accent: "#34d399" },
    { label: "Thành viên Website hôm nay",       value: websiteToday, icon: Globe, accent: "#fbbf24" },
  ];

  return (
    <div className="adm1-card" style={{ marginTop: 4 }}>
      <div className="adm1-card-head" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Users2 size={16} /> Tổng hợp báo cáo Admin 2 (hôm nay)
        </span>
        <button className="adm1-icon-btn" onClick={load} aria-label="Tải lại" title="Tải lại">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="adm1-card-body">
        <div className="adm1-stat-grid">
          {items.map((it) => (
            <div key={it.label} className="adm1-stat-card" style={{ ["--stat-accent" as any]: it.accent }}>
              <div className="adm1-stat-icon"><it.icon size={18} /></div>
              <div className="adm1-stat-label">{it.label}</div>
              <div className="adm1-stat-value">{loading ? "…" : it.value.toLocaleString("vi-VN")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}