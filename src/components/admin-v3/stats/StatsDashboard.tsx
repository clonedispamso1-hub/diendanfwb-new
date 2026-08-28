import { avatarSrc } from "@/lib/image-cdn";
/**
 * Admin V3 — Thống kê V4 (UI only).
 * 4 thẻ: Đăng ký mới hôm nay / Đang hoạt động / Tổng bài viết / Thành viên bị khóa.
 * Không biểu đồ. Card trắng, bo góc, responsive.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, FileText, Lock, Unlock, Search, Loader2, UserPlus, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import "@/styles/admin-stats-crm.css";
import "@/styles/admin-stats-v4.css";
import { read3 } from "@/lib/content-db";

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
  last_seen?: string | null;
  is_online?: boolean | null;
};

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

/** 00:00 hôm nay (giờ máy admin) dạng ISO. */
function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type DrawerKind = "banned" | "new" | "active";
const DRAWER_TITLE: Record<DrawerKind, string> = {
  banned: "Thành viên bị khóa",
  new: "Đăng ký mới hôm nay",
  active: "Thành viên đang hoạt động",
};

const MEMBER_COLS =
  "id, full_name, public_id, avatar, is_banned, banned_until, ban_reason, created_at, last_seen, is_online";

export function StatsDashboard() {
  const [range, setRange] = useState<Range>("all");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState(0);
  const [banned, setBanned] = useState(0);
  const [newToday, setNewToday] = useState(0);
  const [activeNow, setActiveNow] = useState(0);
  const [rows, setRows] = useState<Member[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [kw, setKw] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = sinceIso(range);

      let pq = read3().from("posts").select("id", { count: "exact", head: true });
      if (since) pq = pq.gte("created_at", since);

      const bq = realUserFilter(
        sb.from("profiles").select("id", { count: "exact", head: true }),
      ).eq("is_banned", true);

      // Đăng ký mới từ 00:00 hôm nay (chỉ user thật).
      const nq = realUserFilter(
        sb.from("profiles").select("id", { count: "exact", head: true }),
      ).gte("created_at", todayStartIso());

      // Đang hoạt động: online hoặc có hoạt động trong 15 phút gần nhất.
      const aq = realUserFilter(
        sb.from("profiles").select("id", { count: "exact", head: true }),
      ).gte("last_seen", new Date(Date.now() - 15 * 60_000).toISOString());

      const [p, b, n, a] = await Promise.all([pq, bq, nq, aq]);
      setPosts(p.count || 0);
      setBanned(b.count || 0);
      setNewToday(n.count || 0);
      setActiveNow(a.count || 0);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  // Lazy-load danh sách theo loại ngăn kéo đang mở.
  useEffect(() => {
    if (!drawer) return;
    let cancelled = false;
    setRowsLoading(true);
    setRows([]);
    void (async () => {
      let q = sb.from("profiles").select(MEMBER_COLS);
      if (drawer === "banned") {
        q = q.eq("is_banned", true).order("created_at", { ascending: false });
      } else if (drawer === "new") {
        q = realUserFilter(q).gte("created_at", todayStartIso()).order("created_at", { ascending: false });
      } else {
        q = realUserFilter(q)
          .gte("last_seen", new Date(Date.now() - 15 * 60_000).toISOString())
          .order("last_seen", { ascending: false });
      }
      const { data } = await q.limit(200);
      if (cancelled) return;
      setRows((data as Member[]) || []);
      setRowsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [drawer]);

  const openDrawer = (k: DrawerKind) => { setKw(""); setDrawer(k); };

  const unlock = async (u: Member) => {
    const { error } = await sb.from("profiles").update({ is_banned: false, banned_until: null }).eq("id", u.id);
    if (error) return toast.error(error.message);
    await sb.rpc("admin_unblock_user_devices", { p_user_id: u.id }).catch(() => {});
    toast.success("Đã mở khóa tài khoản");
    setRows((rs) => rs.filter((r) => r.id !== u.id));
    setBanned((n) => Math.max(0, n - 1));
  };

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.full_name || "").toLowerCase().includes(q) ||
        String(r.public_id ?? "").includes(q) ||
        r.id.includes(q),
    );
  }, [rows, kw]);

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
          <span className="sv4-ico sv4-ico-blue"><UserPlus size={18} /></span>
          <div className="sv4-card-label">Đăng ký mới hôm nay</div>
          <div className="sv4-card-value">{newToday.toLocaleString("vi-VN")}</div>
          <button className="sv4-link" onClick={() => openDrawer("new")}>Xem ngay →</button>
        </article>

        <article className="sv4-card">
          <span className="sv4-ico sv4-ico-green"><Activity size={18} /></span>
          <div className="sv4-card-label">Đang hoạt động</div>
          <div className="sv4-card-value">{activeNow.toLocaleString("vi-VN")}</div>
          <button className="sv4-link" onClick={() => openDrawer("active")}>Xem danh sách →</button>
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
          <button className="sv4-link" onClick={() => openDrawer("banned")}>Xem chi tiết →</button>
        </article>
      </div>

      {drawer ? (
        <div className="sv4-drawer-wrap" role="dialog" aria-modal>
          <div className="sv4-drawer-bg" onClick={() => setDrawer(null)} />
          <aside className="sv4-drawer">
            <header className="sv4-drawer-head">
              <div>
                <div className="sv4-drawer-title">{DRAWER_TITLE[drawer]}</div>
                <div className="sv4-sub">{rowsLoading ? "Đang tải…" : `${filtered.length} tài khoản`}</div>
              </div>
              <button className="sv4-btn sv4-btn-ghost" onClick={() => setDrawer(null)}>Đóng</button>
            </header>
            <div className="sv4-search">
              <Search size={14} />
              <input placeholder="Tìm tên / UID…" value={kw} onChange={(e) => setKw(e.target.value)} />
            </div>
            <div className="sv4-drawer-body">
              {rowsLoading ? (
                <p className="sv4-empty"><Loader2 size={14} className="sv4-spin" /> Đang tải danh sách…</p>
              ) : filtered.length === 0 ? (
                <p className="sv4-empty">Không có tài khoản nào.</p>
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
                      {drawer === "banned" ? (
                        <>
                          <div className="sv4-row-reason">
                            Lý do: {u.ban_reason || "Vi phạm điều khoản cộng đồng"}
                          </div>
                          <div className="sv4-row-meta">
                            Thời hạn: {u.banned_until ? new Date(u.banned_until).toLocaleString("vi-VN") : "Vĩnh viễn"}
                          </div>
                        </>
                      ) : drawer === "new" ? (
                        <div className="sv4-row-meta">
                          Đăng ký: {u.created_at ? new Date(u.created_at).toLocaleString("vi-VN") : "—"}
                        </div>
                      ) : (
                        <div className="sv4-row-meta">
                          Hoạt động lúc: {u.last_seen ? new Date(u.last_seen).toLocaleString("vi-VN") : "—"}
                        </div>
                      )}
                    </div>
                    {drawer === "banned" ? (
                      <button className="sv4-btn sv4-btn-ok" onClick={() => void unlock(u)}>
                        <Unlock size={13} /> Mở khóa
                      </button>
                    ) : null}
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
