import { avatarSrc } from "@/lib/image-cdn";
/**
 * Admin V3 — Thống kê V4 (UI only).
 * Chỉ 3 thẻ: Thành viên / Tổng bài viết / Thành viên bị khóa.
 * Không biểu đồ. Card trắng, bo góc, responsive.
 * + Bảng xếp hạng TOP TƯƠNG TÁC TUẦN (admin sửa điểm trực tiếp).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Users, FileText, Lock, Unlock, Search, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminSetSiteSetting } from "@/lib/admin-db";
import "@/styles/admin-stats-crm.css";
import "@/styles/admin-stats-v4.css";

type Range = "today" | "7d" | "30d" | "all";
const RANGE_LABEL: Record<Range, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  "30d": "30 ngày",
  all: "Tất cả",
};

type Member = {
  id: string;
  full_name: string | null;
  public_id: string | number | null;
  avatar: string | null;
  is_banned?: boolean | null;
  banned_until?: string | null;
  ban_reason?: string | null;
  created_at?: string | null;
};

type LbRow = { user_id: string; name: string; avatar: string | null; base: number; score: number };

const sb: any = supabase;

function sinceIso(r: Range): string | null {
  if (r === "all") return null;
  const d = r === "today" ? 1 : r === "7d" ? 7 : 30;
  return new Date(Date.now() - d * 86400_000).toISOString();
}

/** Chỉ tính user thật: bỏ tài khoản clone / nội bộ / admin. */
function realUserFilter(q: any) {
  return q.or("account_source.is.null,account_source.neq.internal").neq("is_admin", true);
}

export function StatsDashboard() {
  const [range, setRange] = useState<Range>("all");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState(0);
  const [posts, setPosts] = useState(0);
  const [banned, setBanned] = useState(0);
  const [bannedRows, setBannedRows] = useState<Member[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [kw, setKw] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = sinceIso(range);
      let mq = realUserFilter(sb.from("profiles").select("id", { count: "exact", head: true }));
      if (since) mq = mq.gte("created_at", since);

      let pq = sb.from("posts").select("id", { count: "exact", head: true });
      if (since) pq = pq.gte("created_at", since);

      const bq = realUserFilter(
        sb.from("profiles").select("id", { count: "exact", head: true }),
      ).eq("is_banned", true);

      const [m, p, b, list] = await Promise.all([
        mq,
        pq,
        bq,
        sb
          .from("profiles")
          .select("id, full_name, public_id, avatar, is_banned, banned_until, ban_reason, created_at")
          .eq("is_banned", true)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      setMembers(m.count || 0);
      setPosts(p.count || 0);
      setBanned(b.count || 0);
      setBannedRows((list.data as Member[]) || []);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const unlock = async (u: Member) => {
    const { error } = await sb.from("profiles").update({ is_banned: false, banned_until: null }).eq("id", u.id);
    if (error) return toast.error(error.message);
    await sb.rpc("admin_unblock_user_devices", { p_user_id: u.id }).catch(() => {});
    toast.success("Đã mở khóa tài khoản");
    setBannedRows((rs) => rs.filter((r) => r.id !== u.id));
    setBanned((n) => Math.max(0, n - 1));
  };

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return bannedRows;
    return bannedRows.filter(
      (r) =>
        (r.full_name || "").toLowerCase().includes(q) ||
        String(r.public_id ?? "").includes(q) ||
        r.id.includes(q),
    );
  }, [bannedRows, kw]);

  return (
    <div className="sv4">
      <div className="sv4-head">
        <div>
          <h2 className="sv4-title">Thống kê hệ thống</h2>
          <p className="sv4-sub">Số liệu người dùng thật (không tính tài khoản clone / nội bộ / admin)</p>
        </div>
        <div className="sv4-tools">
          <div className="sv4-seg">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                className={`sv4-seg-btn ${range === r ? "is-active" : ""}`}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <button className="sv4-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "sv4-spin" : ""} /> Làm mới
          </button>
        </div>
      </div>

      <div className="sv4-cards">
        <article className="sv4-card">
          <span className="sv4-ico sv4-ico-blue"><Users size={18} /></span>
          <div className="sv4-card-label">Thành viên</div>
          <div className="sv4-card-value">{members.toLocaleString("vi-VN")}</div>
          <div className="sv4-card-hint">{RANGE_LABEL[range]} · user thật</div>
        </article>

        <article className="sv4-card">
          <span className="sv4-ico sv4-ico-green"><FileText size={18} /></span>
          <div className="sv4-card-label">Tổng bài viết</div>
          <div className="sv4-card-value">{posts.toLocaleString("vi-VN")}</div>
          <div className="sv4-card-hint">{RANGE_LABEL[range]}</div>
        </article>

        <article className="sv4-card">
          <span className="sv4-ico sv4-ico-red"><Lock size={18} /></span>
          <div className="sv4-card-label">Thành viên bị khóa</div>
          <div className="sv4-card-value">{banned.toLocaleString("vi-VN")}</div>
          <button className="sv4-link" onClick={() => setDrawer(true)}>Xem chi tiết →</button>
        </article>
      </div>

      <LeaderboardEditor />

      {drawer ? (
        <div className="sv4-drawer-wrap" role="dialog" aria-modal>
          <div className="sv4-drawer-bg" onClick={() => setDrawer(false)} />
          <aside className="sv4-drawer">
            <header className="sv4-drawer-head">
              <div>
                <div className="sv4-drawer-title">Thành viên bị khóa</div>
                <div className="sv4-sub">{filtered.length} tài khoản</div>
              </div>
              <button className="sv4-btn sv4-btn-ghost" onClick={() => setDrawer(false)}>Đóng</button>
            </header>
            <div className="sv4-search">
              <Search size={14} />
              <input placeholder="Tìm tên / UID…" value={kw} onChange={(e) => setKw(e.target.value)} />
            </div>
            <div className="sv4-drawer-body">
              {filtered.length === 0 ? (
                <p className="sv4-empty">Không có tài khoản nào bị khóa.</p>
              ) : (
                filtered.map((u) => (
                  <div key={u.id} className="sv4-row">
                    <img
                      className="sv4-avatar"
                      loading="lazy"
                      decoding="async"
                      src={avatarSrc(u.avatar || "/placeholder.svg", 64)}
                      alt={u.full_name || "user"}
                    />
                    <div className="sv4-row-main">
                      <div className="sv4-row-name">{u.full_name || "Người dùng"}</div>
                      <div className="sv4-row-meta">UID: {u.public_id ?? u.id.slice(0, 8)}</div>
                      <div className="sv4-row-reason">
                        Lý do: {u.ban_reason || "Vi phạm điều khoản cộng đồng"}
                      </div>
                      <div className="sv4-row-meta">
                        Thời hạn: {u.banned_until ? new Date(u.banned_until).toLocaleString("vi-VN") : "Vĩnh viễn"}
                      </div>
                    </div>
                    <button className="sv4-btn sv4-btn-ok" onClick={() => void unlock(u)}>
                      <Unlock size={13} /> Mở khóa
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- TOP TƯƠNG TÁC TUẦN — admin sửa điểm trực tiếp ---------- */

function LeaderboardEditor() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: lb }, { data: ov }] = await Promise.all([
          sb.rpc("leaderboard_active_stars_week"),
          sb.rpc("get_site_setting", { _key: "leaderboard_overrides" }),
        ]);
        const overrides: Record<string, number> = (ov && typeof ov === "object" ? ov : {}) as any;
        setRows(
          (lb || []).slice(0, 10).map((r: any) => {
            const uid = r.user_id || r.author_id;
            const base = Number(r.score ?? r.total_interactions ?? 0);
            return {
              user_id: uid,
              name: r.full_name || "Người dùng",
              avatar: r.avatar || null,
              base,
              score: Number(overrides[uid] ?? base),
            };
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const map: Record<string, number> = {};
      rows.forEach((r) => { if (r.score !== r.base) map[r.user_id] = r.score; });
      await adminSetSiteSetting("leaderboard_overrides", map);
      toast.success("Đã lưu điểm bảng xếp hạng");
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sv4-panel">
      <header className="sv4-panel-head">
        <div>
          <div className="sv4-panel-title">TOP TƯƠNG TÁC TUẦN</div>
          <div className="sv4-sub">Sửa điểm trực tiếp — website hiển thị hiệu ứng chạy số.</div>
        </div>
        <button className="sv4-btn" onClick={() => void save()} disabled={saving || loading}>
          {saving ? <Loader2 size={14} className="sv4-spin" /> : <Save size={14} />} Lưu điểm
        </button>
      </header>

      {loading ? (
        <p className="sv4-empty">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="sv4-empty">Chưa có dữ liệu tương tác tuần này.</p>
      ) : (
        <div className="sv4-lb">
          {rows.map((r, i) => (
            <div key={r.user_id} className="sv4-row">
              <span className="sv4-rank">#{i + 1}</span>
              <img
                className="sv4-avatar"
                loading="lazy"
                decoding="async"
                src={avatarSrc(r.avatar || "/placeholder.svg", 64)}
                alt={r.name}
              />
              <div className="sv4-row-main">
                <div className="sv4-row-name">{r.name}</div>
                <div className="sv4-row-meta">Điểm gốc: {r.base.toLocaleString("vi-VN")}</div>
              </div>
              <input
                className="sv4-score"
                type="number"
                min={0}
                value={r.score}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((x) =>
                      x.user_id === r.user_id ? { ...x, score: Math.max(0, Number(e.target.value) || 0) } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
