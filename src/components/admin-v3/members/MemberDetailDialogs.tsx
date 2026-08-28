/**
 * Các popup "Xem" trong Hồ sơ thành viên (Admin V3).
 * Chỉ đọc dữ liệu đang có: posts / follows (Supabase #3), gem_transactions +
 * withdrawal_requests (Supabase #1). Không tạo bảng mới, không sinh dữ liệu giả.
 */
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { avatarSrc } from "@/lib/image-cdn";
import {
  fetchMemberPosts,
  fetchMemberFollowers,
  fetchMemberFollowing,
  type MemberPost,
  type MemberFollowUser,
} from "@/lib/admin-member-detail";
import {
  countAllCategories,
  listCategory,
  GEM_CATEGORIES,
  GEM_CATEGORY_LABEL,
  GEM_RANGE_LABEL,
  type GemCategory,
  type GemEntry,
  type GemRange,
} from "@/lib/admin-gem-history";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "—" : t.toLocaleString("vi-VN");
}

function Shell({
  title, sub, onClose, children,
}: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="adp-modal-backdrop" onClick={onClose}>
      <div className="adp-modal adp-member-view" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">{title}</div>
            {sub ? <div className="adp-modal-time">{sub}</div> : null}
          </div>
          <button className="adp-modal-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div style={{ padding: "0 16px 12px", maxHeight: "60vh", overflow: "auto" }}>{children}</div>
        <footer className="adp-mv-actions">
          <button className="adp-mv-btn is-primary" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: string | null }>({
    loading: true, data: null, error: null,
  });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, data: null, error: null });
    fn().then(
      (data) => alive && setState({ loading: false, data, error: null }),
      (e) => alive && setState({ loading: false, data: null, error: e?.message || String(e) }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const rowStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 8,
  fontSize: 12.5,
};

function Body({ loading, error, empty, children }: {
  loading: boolean; error: string | null; empty: boolean; children: ReactNode;
}) {
  if (loading) return <div className="admv3-dev-block-empty">Đang tải…</div>;
  if (error) return <div className="admv3-dev-block-empty">Lỗi tải dữ liệu: {error}</div>;
  if (empty) return <div className="admv3-dev-block-empty">Không có dữ liệu.</div>;
  return <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>{children}</ul>;
}

/* ---------------- Bài viết ---------------- */
export function MemberPostsDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { loading, data, error } = useAsync<MemberPost[]>(() => fetchMemberPosts(userId), [userId]);
  return (
    <Shell title="Bài viết đã đăng" sub={userId.slice(0, 8)} onClose={onClose}>
      <Body loading={loading} error={error} empty={!data?.length}>
        {(data ?? []).map((p) => (
          <li key={p.id} style={rowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <b style={{ color: "#e5e7eb" }}>❤️ {p.likes_count} · 💬 {p.comments_count}</b>
              <span style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>{fmt(p.created_at)}</span>
            </div>
            {p.content ? (
              <div style={{ marginTop: 4, color: "rgba(255,255,255,.78)", whiteSpace: "pre-wrap" }}>{p.content}</div>
            ) : null}
            {p.image_url ? (
              <img loading="lazy" decoding="async" src={p.image_url} alt=""
                style={{ marginTop: 6, maxHeight: 120, borderRadius: 6 }} />
            ) : null}
          </li>
        ))}
      </Body>
    </Shell>
  );
}

/* ---------------- Follower / Following ---------------- */
export function MemberFollowDialog({
  userId, side, onClose,
}: { userId: string; side: "followers" | "following"; onClose: () => void }) {
  const { loading, data, error } = useAsync<MemberFollowUser[]>(
    () => (side === "followers" ? fetchMemberFollowers(userId) : fetchMemberFollowing(userId)),
    [userId, side],
  );
  return (
    <Shell
      title={side === "followers" ? "Người đang theo dõi user" : "User đang theo dõi"}
      sub={userId.slice(0, 8)}
      onClose={onClose}
    >
      <Body loading={loading} error={error} empty={!data?.length}>
        {(data ?? []).map((u) => (
          <li key={u.id} style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 10 }}>
            <div className="adp-avatar">
              {u.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(u.avatar, 40)} alt="" />
                : <span>{(u.full_name || u.username || "?")[0]?.toUpperCase()}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ color: "#e5e7eb" }}>{u.full_name || u.username || u.id.slice(0, 8)}</b>
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11 }}>@{u.username || "—"}</div>
            </div>
            <span style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>{fmt(u.created_at)}</span>
          </li>
        ))}
      </Body>
    </Shell>
  );
}

/* ---------------- Lịch sử Gem (5 mục) ---------------- */
export function MemberGemHistoryDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [range, setRange] = useState<GemRange>("24h");
  const [counts, setCounts] = useState<Record<GemCategory, number> | null>(null);
  const [cat, setCat] = useState<GemCategory | null>(null);
  const [rows, setRows] = useState<GemEntry[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const PAGE = 20;

  useEffect(() => {
    let alive = true;
    setCounts(null);
    countAllCategories(userId, range).then(
      (c) => alive && setCounts(c),
      (e) => alive && setErr(e?.message || String(e)),
    );
    return () => { alive = false; };
  }, [userId, range]);

  useEffect(() => {
    if (!cat) { setRows([]); return; }
    let alive = true;
    setBusy(true);
    setErr(null);
    listCategory(userId, cat, { range, limit: PAGE, offset: page * PAGE }).then(
      (r) => { if (alive) { setRows(r); setBusy(false); } },
      (e) => { if (alive) { setErr(e?.message || String(e)); setBusy(false); } },
    );
    return () => { alive = false; };
  }, [userId, cat, range, page]);

  const total = counts ? GEM_CATEGORIES.reduce((s, c) => s + counts[c], 0) : null;

  return (
    <Shell
      title="Lịch sử Gem"
      sub={`${GEM_RANGE_LABEL[range]}${total == null ? "" : ` · ${total} giao dịch`}`}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {(Object.keys(GEM_RANGE_LABEL) as GemRange[]).map((r) => (
          <button
            key={r}
            className="admv3-chip"
            style={{ opacity: r === range ? 1 : 0.55, fontWeight: r === range ? 700 : 500 }}
            onClick={() => { setRange(r); setPage(0); }}
          >
            {GEM_RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
        {GEM_CATEGORIES.map((c) => {
          const activeCat = cat === c;
          return (
            <button
              key={c}
              onClick={() => { setCat(activeCat ? null : c); setPage(0); }}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                background: activeCat ? "rgba(99,102,241,.22)" : "rgba(255,255,255,.05)",
                border: `1px solid ${activeCat ? "rgba(129,140,248,.6)" : "rgba(255,255,255,.08)"}`,
                color: "#e5e7eb",
              }}
            >
              <div style={{ fontSize: 11.5, opacity: 0.72 }}>{GEM_CATEGORY_LABEL[c]}</div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                {counts ? counts[c] : "…"}
              </div>
            </button>
          );
        })}
      </div>

      {!cat ? (
        <div className="admv3-dev-block-empty">Chọn một mục để xem danh sách giao dịch.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#e5e7eb" }}>
            {GEM_CATEGORY_LABEL[cat]} — trang {page + 1}
          </div>
          <Body loading={busy} error={err} empty={!rows.length}>
            {rows.map((r) => (
              <li key={`${cat}-${r.id}`} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <b style={{ color: "#e5e7eb" }}>{r.counterpart || "—"}</b>
                  <b style={{ color: r.amount >= 0 ? "#34d399" : "#f87171" }}>
                    {r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString("vi-VN")} 💎
                  </b>
                </div>
                <div style={{ marginTop: 4, color: "rgba(255,255,255,.65)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{r.note || ""}{r.status ? ` · ${r.status}` : ""}</span>
                  <span style={{ fontSize: 11 }}>{fmt(r.at)} · #{r.code}</span>
                </div>
              </li>
            ))}
          </Body>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button className="admv3-chip" disabled={page === 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ← Trước
            </button>
            <button className="admv3-chip" disabled={busy || rows.length < PAGE} onClick={() => setPage((p) => p + 1)}>
              Sau →
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

