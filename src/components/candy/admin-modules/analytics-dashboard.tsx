import { useEffect, useState, useCallback } from "react";
import { TrendingUp, RefreshCw, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, StatCard, EmptyHint } from "./module-shell";

export function AnalyticsDashboard() {
  const sb = supabase as any;
  const [dau, setDau] = useState(0);
  const [mau, setMau] = useState(0);
  const [newUsers, setNew] = useState(0);
  const [topPosts, setTopPosts] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const month = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const [dauR, mauR, newR, postsR] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen", day),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen", month),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", day),
      sb.from("posts").select("id, content, likes_count, comments_count, created_at").order("likes_count", { ascending: false }).limit(10),
    ]);
    setDau(dauR.count ?? 0);
    setMau(mauR.count ?? 0);
    setNew(newR.count ?? 0);
    setTopPosts((postsR.data as any[]) ?? []);

    // hashtag extraction client-side
    const tagMap = new Map<string, number>();
    (postsR.data as any[] | null)?.forEach((p) => {
      const matches = String(p.content || "").match(/#[\p{L}0-9_]+/gu) || [];
      matches.forEach((t) => tagMap.set(t, (tagMap.get(t) || 0) + 1));
    });
    setHashtags([...tagMap.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10));

    setLoading(false);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  return (
    <ModuleShell
      title="Analytics Dashboard"
      subtitle="DAU / MAU / engagement / trending"
      actions={<button className="icon-button" onClick={() => void load()}><RefreshCw size={14} /></button>}
    >
      <div className="adm-stat-grid">
        <StatCard label="DAU" value={dau} tone="good" />
        <StatCard label="MAU" value={mau} />
        <StatCard label="User mới (24h)" value={newUsers} tone="good" />
        <StatCard label="Retention DAU/MAU" value={mau ? `${((dau / mau) * 100).toFixed(1)}%` : "—"} />
      </div>

      <div className="adm-section-title">Top posts</div>
      {loading ? <EmptyHint>Đang tải…</EmptyHint> : topPosts.length === 0 ? (
        <EmptyHint>Không có dữ liệu.</EmptyHint>
      ) : (
        <div className="adm-list">
          {topPosts.map((p) => (
            <div key={p.id} className="adm-row">
              <div className="adm-row-icon"><TrendingUp size={16} /></div>
              <div className="adm-row-main">
                <div className="adm-row-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.content || "(không nội dung)"}
                </div>
                <div className="adm-row-meta">
                  <span>❤ {p.likes_count ?? 0}</span>
                  <span>💬 {p.comments_count ?? 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hashtags.length > 0 && (
        <>
          <div className="adm-section-title">Trending hashtags</div>
          <div className="adm-tag-cloud">
            {hashtags.map((h) => (
              <span key={h.tag} className="adm-tag"><Hash size={10} /> {h.tag.replace(/^#/, "")} · {h.count}</span>
            ))}
          </div>
        </>
      )}
    </ModuleShell>
  );
}
