// Thống kê (Analytics) — Dashboard đầy đủ 6 hàng.
// Toàn bộ số liệu lấy trực tiếp từ Supabase, có nút làm mới.
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/admin-stats-crm.css";

const sb: any = supabase;

const nf = new Intl.NumberFormat("vi-VN");
const fmt = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgoISO(n: number) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function count(table: string, build?: (q: any) => any): Promise<number> {
  try {
    let q = sb.from(table).select("id", { count: "exact", head: true });
    if (build) q = build(q);
    const { count: c } = await q;
    return c ?? 0;
  } catch {
    return 0;
  }
}

async function rows(table: string, select: string, build?: (q: any) => any): Promise<any[]> {
  try {
    let q = sb.from(table).select(select);
    if (build) q = build(q);
    const { data } = await q;
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

function bucketByDay(list: any[], field: string, days: number) {
  const out: { label: string; value: number }[] = [];
  const map = new Map<string, number>();
  for (const r of list) {
    const v = r?.[field];
    if (!v) continue;
    const k = new Date(v).toISOString().slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay();
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: map.get(k) ?? 0 });
  }
  return out;
}

function Chart({ data, tone = "" }: { data: { label: string; value: number }[]; tone?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <>
      <div className="asx-chart">
        {data.map((d, i) => (
          <div className="asx-bar-wrap" key={i} title={`${d.label}: ${fmt(d.value)}`}>
            <div className={`asx-bar ${tone}`} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="asx-chart-foot">
        <span>{data[0]?.label}</span>
        <span>cao nhất: {fmt(max)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: any; tone?: string; hint?: string }) {
  return (
    <div className={`asx-tile ${tone ?? ""}`}>
      <div className="asx-tile-label">{label}</div>
      <div className="asx-tile-value">{value}</div>
      {hint && <div className="asx-tile-hint">{hint}</div>}
    </div>
  );
}

function TopTable({ title, rows: r }: { title: string; rows: { name: string; value: string }[] }) {
  return (
    <div className="asx-panel">
      <div className="asx-panel-title">{title}</div>
      {r.length === 0 ? (
        <div className="asx-empty">Chưa có dữ liệu.</div>
      ) : (
        <table className="asx-table">
          <tbody>
            {r.map((x, i) => (
              <tr key={i}>
                <td style={{ width: 28, opacity: 0.5 }}>{i + 1}</td>
                <td style={{ whiteSpace: "normal" }}>{x.name}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{x.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type State = Record<string, any>;

export function StatsDashboard() {
  const [s, setS] = useState<State>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = startOfDay().toISOString();
    const d7 = daysAgoISO(6);
    const d30 = daysAgoISO(29);

    const [
      totalMembers, online, newToday, banned, clones, totalPosts, msgToday,
      regs30, posts30, msgs30, comToday, likeToday,
      profileList, cloneList, postAgg, reportAgg, gemTx,
    ] = await Promise.all([
      count("profiles", (q) => q.neq("account_source", "internal")),
      count("profiles", (q) => q.eq("is_online", true)),
      count("profiles", (q) => q.gte("created_at", today)),
      count("profiles", (q) => q.eq("is_banned", true)),
      count("profiles", (q) => q.eq("account_source", "internal")),
      count("posts"),
      count("messages", (q) => q.gte("created_at", today)),
      rows("profiles", "created_at", (q) => q.gte("created_at", d30).limit(5000)),
      rows("posts", "created_at", (q) => q.gte("created_at", d30).limit(5000)),
      rows("messages", "created_at", (q) => q.gte("created_at", d30).limit(10000)),
      count("comments", (q) => q.gte("created_at", today)),
      count("likes", (q) => q.gte("created_at", today)),
      rows("profiles", "id, full_name, username, gem_balance, is_admin, is_online, last_seen, account_source, gender", (q) =>
        q.order("gem_balance", { ascending: false }).limit(2000),
      ),
      rows("profiles", "id, gender, is_online", (q) => q.eq("account_source", "internal").limit(5000)),
      rows("posts", "user_id, likes_count", (q) => q.order("created_at", { ascending: false }).limit(3000)),
      rows("reports", "reported_user_id", (q) => q.limit(3000)),
      rows("gem_transactions", "amount, type, created_at", (q) => q.gte("created_at", d30).limit(5000)),
    ]);

    const nameOf = new Map<string, string>();
    profileList.forEach((p) => nameOf.set(p.id, p.full_name || p.username || p.id.slice(0, 8)));

    // vi phạm = số user bị report (distinct)
    const reportCount = new Map<string, number>();
    reportAgg.forEach((r) => {
      if (r.reported_user_id) reportCount.set(r.reported_user_id, (reportCount.get(r.reported_user_id) ?? 0) + 1);
    });

    const postCount = new Map<string, number>();
    const likeCount = new Map<string, number>();
    postAgg.forEach((p) => {
      if (!p.user_id) return;
      postCount.set(p.user_id, (postCount.get(p.user_id) ?? 0) + 1);
      likeCount.set(p.user_id, (likeCount.get(p.user_id) ?? 0) + (p.likes_count ?? 0));
    });

    const topFrom = (m: Map<string, number>, suffix: string) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, v]) => ({ name: nameOf.get(id) ?? id.slice(0, 8), value: `${fmt(v)} ${suffix}` }));

    const gemOf = (list: any[]) => list.reduce((t, p) => t + (Number(p.gem_balance) || 0), 0);
    const realUsers = profileList.filter((p) => p.account_source !== "internal" && !p.is_admin);
    const cloneUsers = profileList.filter((p) => p.account_source === "internal");
    const adminUsers = profileList.filter((p) => p.is_admin);

    let gemOut = 0;
    let gemIn = 0;
    gemTx.forEach((t) => {
      const a = Number(t.amount) || 0;
      if (a >= 0) gemOut += a;
      else gemIn += Math.abs(a);
    });

    setS({
      totalMembers, online, newToday, banned, clones, totalPosts, msgToday,
      violators: reportCount.size,
      reg7: bucketByDay(regs30, "created_at", 7),
      reg30: bucketByDay(regs30, "created_at", 30),
      posts14: bucketByDay(posts30, "created_at", 14),
      msgs14: bucketByDay(msgs30, "created_at", 14),
      topOnline: profileList
        .filter((p) => p.is_online)
        .slice(0, 5)
        .map((p) => ({ name: nameOf.get(p.id)!, value: "đang online" })),
      topPosters: topFrom(postCount, "bài"),
      topGem: profileList.slice(0, 5).map((p) => ({ name: nameOf.get(p.id)!, value: `${fmt(p.gem_balance ?? 0)} 💎` })),
      topLikes: topFrom(likeCount, "❤"),
      topReported: topFrom(reportCount, "report"),
      topClones: cloneUsers.slice(0, 5).map((p) => ({ name: nameOf.get(p.id)!, value: p.is_online ? "online" : "offline" })),
      cloneMale: cloneList.filter((c) => String(c.gender).toLowerCase().startsWith("m") || c.gender === "nam").length,
      cloneFemale: cloneList.filter((c) => String(c.gender).toLowerCase().startsWith("f") || c.gender === "nữ").length,
      cloneTotal: cloneList.length,
      cloneOnline: cloneList.filter((c) => c.is_online).length,
      cloneOffline: cloneList.filter((c) => !c.is_online).length,
      todayReg: newToday,
      todayPosts: posts30.filter((p) => p.created_at >= today).length,
      todayComments: comToday,
      todayMsgs: msgToday,
      todayLikes: likeToday,
      gemTotal: gemOf(profileList),
      gemUser: gemOf(realUsers),
      gemClone: gemOf(cloneUsers),
      gemAdmin: gemOf(adminUsers),
      gemOut,
      gemIn,
      d7,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const t = useMemo(() => s, [s]);

  return (
    <div className="admv3-page">
      <div className="admv3-page-header">
        <div>
          <h1 className="admv3-page-title">Thống kê</h1>
          <p className="admv3-page-sub">Tổng quan · hoạt động · top · clone · tài chính</p>
        </div>
        <button className="asx-btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      {/* HÀNG 1 — TỔNG QUAN */}
      <div className="asx-section">
        <div className="asx-section-title">Tổng quan</div>
        <div className="asx-grid asx-grid-8">
          <Tile label="👥 Tổng thành viên" value={fmt(t.totalMembers)} />
          <Tile label="🟢 Đang online" value={fmt(t.online)} tone="good" />
          <Tile label="🆕 Thành viên mới hôm nay" value={fmt(t.newToday)} tone="good" />
          <Tile label="🚫 Thành viên bị khóa" value={fmt(t.banned)} tone="bad" />
          <Tile label="⚠️ Thành viên vi phạm" value={fmt(t.violators)} tone="warn" hint="có ít nhất 1 report" />
          <Tile label="🤖 Clone hiện có" value={fmt(t.clones)} />
          <Tile label="📝 Tổng bài viết" value={fmt(t.totalPosts)} />
          <Tile label="💬 Tổng tin nhắn hôm nay" value={fmt(t.msgToday)} />
        </div>
      </div>

      {/* HÀNG 2 — HOẠT ĐỘNG */}
      <div className="asx-section">
        <div className="asx-section-title">Hoạt động</div>
        <div className="asx-grid asx-grid-2">
          <div className="asx-panel">
            <div className="asx-panel-title">Thành viên đăng ký · 7 ngày</div>
            <Chart data={t.reg7 ?? []} tone="g" />
          </div>
          <div className="asx-panel">
            <div className="asx-panel-title">Thành viên đăng ký · 30 ngày</div>
            <Chart data={t.reg30 ?? []} tone="g" />
          </div>
          <div className="asx-panel">
            <div className="asx-panel-title">Bài viết theo ngày · 14 ngày</div>
            <Chart data={t.posts14 ?? []} />
          </div>
          <div className="asx-panel">
            <div className="asx-panel-title">Tin nhắn theo ngày · 14 ngày</div>
            <Chart data={t.msgs14 ?? []} tone="alt" />
          </div>
        </div>
      </div>

      {/* HÀNG 3 — TOP */}
      <div className="asx-section">
        <div className="asx-section-title">Bảng xếp hạng</div>
        <div className="asx-grid asx-grid-3">
          <TopTable title="Người online nhiều nhất" rows={t.topOnline ?? []} />
          <TopTable title="Người đăng bài nhiều nhất" rows={t.topPosters ?? []} />
          <TopTable title="Người có nhiều Gem nhất" rows={t.topGem ?? []} />
          <TopTable title="Người có nhiều lượt thích nhất" rows={t.topLikes ?? []} />
          <TopTable title="Người bị report nhiều nhất" rows={t.topReported ?? []} />
          <TopTable title="Clone hoạt động nhiều nhất" rows={t.topClones ?? []} />
        </div>
      </div>

      {/* HÀNG 4 — CLONE */}
      <div className="asx-section">
        <div className="asx-section-title">Clone</div>
        <div className="asx-grid asx-grid-4">
          <Tile label="Clone nam" value={fmt(t.cloneMale)} />
          <Tile label="Clone nữ" value={fmt(t.cloneFemale)} />
          <Tile label="Tổng clone" value={fmt(t.cloneTotal)} />
          <Tile label="Clone online" value={fmt(t.cloneOnline)} tone="good" />
          <Tile label="Clone offline" value={fmt(t.cloneOffline)} />
        </div>
      </div>

      {/* HÀNG 5 — HÔM NAY */}
      <div className="asx-section">
        <div className="asx-section-title">Hôm nay</div>
        <div className="asx-grid asx-grid-4">
          <Tile label="Đăng ký" value={fmt(t.todayReg)} />
          <Tile label="Đăng bài" value={fmt(t.todayPosts)} />
          <Tile label="Comment" value={fmt(t.todayComments)} />
          <Tile label="Tin nhắn" value={fmt(t.todayMsgs)} />
          <Tile label="Like" value={fmt(t.todayLikes)} />
        </div>
      </div>

      {/* HÀNG 6 — TÀI CHÍNH */}
      <div className="asx-section">
        <div className="asx-section-title">Thống kê tài chính (Gem)</div>
        <div className="asx-grid asx-grid-4">
          <Tile label="💎 Gem toàn hệ thống" value={fmt(t.gemTotal)} />
          <Tile label="Gem User" value={fmt(t.gemUser)} />
          <Tile label="Gem Clone" value={fmt(t.gemClone)} />
          <Tile label="Gem Admin" value={fmt(t.gemAdmin)} />
          <Tile label="Gem đã phát (30 ngày)" value={fmt(t.gemOut)} tone="good" />
          <Tile label="Gem đã thu (30 ngày)" value={fmt(t.gemIn)} tone="warn" />
          <Tile label="Gem tồn" value={fmt(t.gemTotal)} hint="tổng số dư hiện tại" />
        </div>
      </div>
    </div>
  );
}
