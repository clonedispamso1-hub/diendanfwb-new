import { avatarSrc } from "@/lib/image-cdn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Heart, MessageCircle, Trash2, Lock, Unlock,
  MessageSquareOff, MessageSquare, Pin, PinOff,
  X, ChevronDown, Filter, RefreshCw, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { DeletedPostsManager } from "@/components/admin-v1/DeletedPostsManager";


/* ---------------------------------------------------------------
   Types
   --------------------------------------------------------------- */

export type AdminPostStatus =
  | "normal"
  | "pinned"
  | "comments_off"
  | "locked"
  | "pending";

export type AdminPostRow = {
  id: string;            // post_code or fallback to uuid
  uuid: string;          // posts.id (uuid) — used for DB operations
  user_id: string;
  username: string;
  avatar: string | null;
  content: string;
  image_urls?: string[];
  video_url?: string | null;
  created_at: string;    // ISO
  likes: number;
  comments: number;
  status: AdminPostStatus;
  pinned_until?: string | null;
};

const STATUS_META: Record<AdminPostStatus, { label: string; color: string; bg: string }> = {
  normal:        { label: "Bình thường",     color: "#9ca3af", bg: "rgba(156,163,175,0.15)" },
  pinned:        { label: "📌 Đã ghim",      color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
  comments_off:  { label: "Tắt bình luận",   color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
  locked:        { label: "🚫 Đã khóa",      color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  pending:       { label: "Chờ kiểm duyệt",  color: "#f472b6", bg: "rgba(244,114,182,0.15)" },
};

const PIN_OPTIONS = [1, 3, 6, 12, 24];


/* ---------------------------------------------------------------
   Data fetching
   --------------------------------------------------------------- */

function deriveStatus(p: any): AdminPostStatus {
  const now = Date.now();
  if (p.is_locked) return "locked";
  const pinnedActive = p.is_pinned && (!p.pinned_until || new Date(p.pinned_until).getTime() > now);
  if (pinnedActive) return "pinned";
  if (p.comments_disabled) return "comments_off";
  return "normal";
}


export type TimeRange = "today" | "7d" | "30d" | "all";

function timeRangeCutoffIso(range: TimeRange): string | null {
  const now = Date.now();
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (range === "7d") return new Date(now - 7 * 86400_000).toISOString();
  if (range === "30d") return new Date(now - 30 * 86400_000).toISOString();
  return null;
}

async function fetchPosts(opts: {
  range: TimeRange;
  page: number;
  pageSize: number;
}): Promise<{ rows: AdminPostRow[]; total: number }> {
  const { range, page, pageSize } = opts;
  const cutoffIso = timeRangeCutoffIso(range);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = (supabase.from("posts") as any)
    .select(
      "id, post_code, user_id, content, image_urls, image_url, video_url, created_at, likes_count, comments_count, is_locked, is_pinned, pinned_until, comments_disabled",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (cutoffIso) q = q.gte("created_at", cutoffIso);

  const { data: posts, error, count } = await q;
  if (error) throw error;
  const list: any[] = posts || [];
  const total = typeof count === "number" ? count : list.length;
  if (list.length === 0) return { rows: [], total };

  const userIds = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean)));
  const profilesMap = new Map<string, any>();
  if (userIds.length) {
    const { data: profs } = await (supabase.from("profiles") as any)
      .select("id, username, full_name, avatar, avatar_url")
      .in("id", userIds);
    (profs || []).forEach((p: any) => profilesMap.set(p.id, p));
  }
  const ids: string[] = list.map((p) => p.id);

  const [likesRes, commentsRes] = await Promise.all([
    (supabase.from("likes") as any).select("post_id").in("post_id", ids),
    (supabase.from("comments") as any).select("post_id").in("post_id", ids),
  ]);

  const tally = (rows: any[] | null, key = "post_id") => {
    const m = new Map<string, number>();
    (rows || []).forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + 1));
    return m;
  };
  const likesMap = tally(likesRes.data);
  const commentsMap = tally(commentsRes.data);

  const rows = list.map((p): AdminPostRow => {
    const prof = profilesMap.get(p.user_id) || {};
    const images: string[] = Array.isArray(p.image_urls)
      ? p.image_urls
      : p.image_url ? [p.image_url] : [];
    return {
      id: (p.post_code as string) || (p.id as string),
      uuid: p.id,
      user_id: p.user_id || "",
      username: prof.username || prof.full_name || "Người dùng",
      avatar: prof.avatar_url || prof.avatar || null,
      content: p.content || "",
      image_urls: images,
      video_url: p.video_url || null,
      created_at: p.created_at,
      likes: likesMap.get(p.id) || (p.likes_count ?? 0),
      comments: commentsMap.get(p.id) || (p.comments_count ?? 0),
      status: deriveStatus(p),
      pinned_until: p.pinned_until || null,
    };
  });
  return { rows, total };
}





/* ---------------------------------------------------------------
   Component
   --------------------------------------------------------------- */

const PAGE_SIZE = 10;

export function HomePostsManager() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<AdminPostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminPostStatus | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [detail, setDetail] = useState<AdminPostRow | null>(null);
  const [pinFor, setPinFor] = useState<AdminPostRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<AdminPostRow | null>(null);
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    const my = ++reqRef.current;
    setLoading(true);
    try {
      const data = await fetchPosts({ range: timeRange, page, pageSize: PAGE_SIZE });
      if (my === reqRef.current) {
        setRows(data.rows);
        setTotal(data.total);
      }
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách bài viết.");
    } finally {
      if (my === reqRef.current) setLoading(false);
    }
  }, [timeRange, page]);

  useEffect(() => { void reload(); }, [reload]);

  // Reset về trang 1 khi đổi khoảng thời gian
  useEffect(() => { setPage(1); }, [timeRange]);




  // Status + search là filter phía client trên trang hiện tại.
  // Bài đã ghim luôn ưu tiên lên đầu, sắp theo thời gian pin còn lại (mới nhất trước).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const ap = a.status === "pinned" ? 1 : 0;
      const bp = b.status === "pinned" ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (ap && bp) {
        const at = a.pinned_until ? new Date(a.pinned_until).getTime() : 0;
        const bt = b.pinned_until ? new Date(b.pinned_until).getTime() : 0;
        if (bt !== at) return bt - at;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, query, statusFilter]);


  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));


  /* ---------- actions ---------- */


  const doDelete = async (r: AdminPostRow) => {
    // Soft delete: chỉ chuyển trạng thái deleted để có thể khôi phục sau.
    const reason = window.prompt("Lý do xóa (tuỳ chọn):", "") ?? "";
    const { error } = await (supabase as any).rpc("admin_soft_delete_post", {
      p_post_id: r.uuid,
      p_reason: reason.trim() || null,
    });
    if (error) {
      const { error: e2 } = await (supabase.from("posts") as any)
        .update({ deleted_at: new Date().toISOString(), delete_reason: reason.trim() || null })
        .eq("id", r.uuid);
      if (e2) {
        toast.error(e2.message || "Không thể xóa bài viết.");
        return;
      }
    }
    setRows((rs) => rs.filter((x) => x.uuid !== r.uuid));
    setConfirmDel(null);
    if (detail?.uuid === r.uuid) setDetail(null);
    toast.success(`Đã chuyển bài ${r.id} vào thùng rác.`);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("feed:refresh"));
  };

  const refreshFeed = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("feed:refresh"));
    }
  };

  const callRpc = async (
    fn: "admin_pin_post" | "admin_bump_post" | "admin_set_comments_disabled" | "admin_lock_post" | "admin_feature_post",
    args: Record<string, any>,
    successMsg: string,
  ) => {
    const { error } = await (supabase as any).rpc(fn, args);
    if (error) {
      toast.error(error.message || "RPC thất bại.");
      return false;
    }
    toast.success(successMsg);
    await reload();
    refreshFeed();
    return true;
  };

  const notifyOwner = async (
    r: AdminPostRow,
    type: "post_locked" | "post_comments_disabled",
    title: string,
    message: string,
  ) => {
    if (!r.user_id) return;
    try {
      await (supabase.from("notifications") as any).insert({
        user_id: r.user_id,
        type,
        title,
        message,
        is_read: false,
        data: { post_id: r.uuid, popup_pending: true, kind: "moderation" },
      });
    } catch { /* best-effort — RLS may block, safe to ignore */ }
  };

  const doLockToggle = async (r: AdminPostRow) => {
    const lock = r.status !== "locked";
    const ok = await callRpc(
      "admin_lock_post",
      { p_post_id: r.uuid, p_lock: lock },
      lock ? `Đã khóa bài ${r.id}.` : `Đã mở khóa bài ${r.id}.`,
    );
    if (ok && lock) {
      await notifyOwner(
        r,
        "post_locked",
        "Bài viết của bạn đã bị khóa",
        "Bài viết của bạn đã bị đội ngũ kiểm duyệt khóa.",
      );
    }
  };

  const doCommentsToggle = async (r: AdminPostRow) => {
    const disable = r.status !== "comments_off";
    const ok = await callRpc(
      "admin_set_comments_disabled",
      { p_post_id: r.uuid, p_disabled: disable },
      disable ? `Đã tắt bình luận bài ${r.id}.` : `Đã bật bình luận bài ${r.id}.`,
    );
    if (ok && disable) {
      await notifyOwner(
        r,
        "post_comments_disabled",
        "Bình luận đã bị tắt",
        "Bình luận trên bài viết của bạn đã bị đội ngũ kiểm duyệt tắt.",
      );
    }
  };


  const doPin = async (r: AdminPostRow, hours: number) => {
    const ok = await callRpc(
      "admin_pin_post",
      { p_post_id: r.uuid, p_hours: hours },
      `Đã ghim bài ${r.id} trong ${hours} giờ.`,
    );
    if (ok) setPinFor(null);
  };

  const doUnpin = async (r: AdminPostRow) => {
    await callRpc(
      "admin_pin_post",
      { p_post_id: r.uuid, p_hours: 0 },
      `Đã gỡ ghim bài ${r.id}.`,
    );
  };





  const tabsBar = (
    <div className="adp-actions" style={{ marginBottom: 12 }}>
      <button
        className={`adp-act${tab === "active" ? " is-on" : ""}`}
        onClick={() => setTab("active")}
      >
        📝 <span>Bài viết</span>
      </button>
      <button
        className={`adp-act${tab === "deleted" ? " is-on" : ""}`}
        onClick={() => setTab("deleted")}
      >
        🗑️ <span>Bài viết đã xóa</span>
      </button>
    </div>
  );

  if (tab === "deleted") {
    return (
      <div>
        {tabsBar}
        <DeletedPostsManager />
      </div>
    );
  }

  return (
    <div className="adp-wrap">
      {tabsBar}
      {/* TOOLBAR */}
      <div className="adp-toolbar">
        <div className="adp-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo POST ID, User ID hoặc Username…"
          />
          {query && (
            <button onClick={() => setQuery("")} className="adp-search-clear">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="adp-filter">
          <Filter size={14} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>

        <div className="adp-filter">
          <Filter size={14} />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="today">Hôm nay</option>
            <option value="7d">7 ngày</option>
            <option value="30d">30 ngày</option>
            <option value="all">Tất cả</option>
          </select>
          <ChevronDown size={14} />
        </div>

        <button className="adp-refresh" title="Làm mới" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "Đang tải…" : "Làm mới"}</span>
        </button>

        <button
          className="adp-refresh"
          title="Xóa toàn bộ bài viết"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", borderColor: "rgba(239,68,68,0.4)" }}
          onClick={async () => {
            const phrase = window.prompt(
              'CẢNH BÁO: Thao tác này sẽ XÓA VĨNH VIỄN TOÀN BỘ bài viết trong hệ thống và KHÔNG THỂ khôi phục.\n\nGõ đúng mật mã sau để xác nhận:\n\nXOAHETDI',
            );
            if ((phrase || "").trim().toUpperCase() !== "XOAHETDI") return;
            try {
              const { deleteAllPosts } = await import("@/lib/admin-bulk");
              const removed = await deleteAllPosts("XOAHETDI");
              toast.success(`Đã xóa vĩnh viễn ${removed} bài viết.`);
            } catch (e: any) {
              toast.error(e?.message || "Không thể xóa.");
              return;
            }
            // Dọn sạch TOÀN BỘ cache React Query để mọi surface phải fetch lại.
            try {
              queryClient.cancelQueries();
              queryClient.removeQueries();
              queryClient.clear();
            } catch { /* noop */ }
            await reload();
            const { broadcastAdminPurge } = await import("@/lib/admin-broadcast");
            await broadcastAdminPurge("posts");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("feed:refresh"));
              window.dispatchEvent(new CustomEvent("admin:purge", { detail: { kind: "posts" } }));
            }
          }}


        >
          <Trash2 size={14} />
          <span>Xóa toàn bộ</span>
        </button>
      </div>

      {/* Note about result count */}
      <div className="adp-note">
        Tổng cộng {total} bài viết · trang {page}/{totalPages} · 10 bài/trang.
      </div>



      {/* TABLE (desktop) / CARDS (mobile) */}
      <div className="adp-table-wrap">
        <table className="adp-table">
          <thead>
            <tr>
              <th className="col-id">POST ID</th>
              <th className="col-time">Thời gian</th>
              <th className="col-user">Người đăng</th>
              <th className="col-content">Nội dung</th>
              <th className="num col-metric">❤️</th>
              <th className="num col-metric">💬</th>
              <th className="col-status">Trạng thái</th>
              <th className="col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="adp-empty-row">
                  Không có bài viết phù hợp.
                </td>
              </tr>
            )}

            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setDetail(r)} className="adp-row">
                <td className="adp-id">{r.id}</td>
                <td className="adp-time">{formatTime(r.created_at)}</td>
                <td>
                  <div className="adp-user">
                    <div className="adp-avatar">
                      {r.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(r.avatar, 64)} alt={r.username} /> : <span>{r.username[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="adp-user-meta">
                      <div className="adp-username">{r.username}</div>
                      <div className="adp-userid">{r.user_id}</div>
                    </div>
                  </div>
                </td>
                <td className="adp-content">{truncate(r.content, 60)}</td>
                <td className="num">{fmt(r.likes)}</td>
                <td className="num">{fmt(r.comments)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <RowActions
                    row={r}
                    onView={() => setDetail(r)}
                    onDelete={() => setConfirmDel(r)}
                    onLockToggle={() => doLockToggle(r)}
                    onCommentsToggle={() => doCommentsToggle(r)}
                    onPin={() => setPinFor(r)}
                    onUnpin={() => doUnpin(r)}
                  />
                </td>

              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card list */}
        <div className="adp-cards">
          {filtered.length === 0 && (
            <div className="adp-empty-card">Không có bài viết phù hợp.</div>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="adp-card" onClick={() => setDetail(r)}>
              <div className="adp-card-head">
                <div className="adp-user">
                  <div className="adp-avatar">
                    {r.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(r.avatar, 64)} alt={r.username} /> : <span>{r.username[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="adp-user-meta">
                    <div className="adp-username">{r.username}</div>
                    <div className="adp-userid">{r.id} · {formatTime(r.created_at)}</div>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="adp-card-content">{truncate(r.content, 120)}</div>
              <div className="adp-card-metrics">
                <span><Heart size={13} /> {fmt(r.likes)}</span>
                <span><MessageCircle size={13} /> {fmt(r.comments)}</span>
              </div>
              <div className="adp-card-actions" onClick={(e) => e.stopPropagation()}>
                <RowActions
                  row={r} compact
                  onView={() => setDetail(r)}
                  onDelete={() => setConfirmDel(r)}
                  onLockToggle={() => doLockToggle(r)}
                  onCommentsToggle={() => doCommentsToggle(r)}
                  onPin={() => setPinFor(r)}
                  onUnpin={() => doUnpin(r)}
                />
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="adp-toolbar" style={{ justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
          <button
            className="adp-refresh"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Trước
          </button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "..." ? (
              <span key={`e${i}`} style={{ padding: "0 6px", opacity: 0.6 }}>…</span>
            ) : (
              <button
                key={n}
                className="adp-refresh"
                style={
                  n === page
                    ? { background: "rgba(251,191,36,0.18)", borderColor: "rgba(251,191,36,0.6)", color: "#fbbf24" }
                    : undefined
                }
                disabled={loading}
                onClick={() => setPage(n as number)}
              >
                {n}
              </button>
            ),
          )}
          <button
            className="adp-refresh"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau →
          </button>
        </div>
      )}



      {/* DETAIL MODAL */}
      {detail && (
        <PostDetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onDelete={() => setConfirmDel(detail)}
          onLockToggle={() => doLockToggle(detail)}
          onCommentsToggle={() => doCommentsToggle(detail)}
          onPin={() => setPinFor(detail)}
          onUnpin={() => doUnpin(detail)}
        />
      )}


      {/* PIN PICKER */}
      {pinFor && (
        <PinDialog
          row={pinFor}
          onCancel={() => setPinFor(null)}
          onPick={(h) => doPin(pinFor, h)}
        />
      )}

      {/* DELETE CONFIRM */}
      {confirmDel && (
        <ConfirmDialog
          title="Xóa bài viết?"
          message={`Bài viết ${confirmDel.id} sẽ bị xóa vĩnh viễn khỏi hệ thống. Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa vĩnh viễn"
          danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => doDelete(confirmDel)}
        />
      )}

      <PostsStyles />
    </div>
  );
}

/* ---------------- Sub components ---------------- */

function StatusBadge({ status }: { status: AdminPostStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="adp-badge" style={{ color: m.color, background: m.bg, borderColor: m.color + "55" }}>
      {m.label}
    </span>
  );
}

function RowActions({
  row, compact, onView, onDelete, onLockToggle, onCommentsToggle, onPin, onUnpin,
}: {
  row: AdminPostRow; compact?: boolean;
  onView: () => void; onDelete: () => void;
  onLockToggle: () => void; onCommentsToggle: () => void;
  onPin: () => void; onUnpin: () => void;
}) {
  const isLocked = row.status === "locked";
  const commentsOff = row.status === "comments_off";
  const pinned = row.status === "pinned";

  return (
    <div className={`adp-actions ${compact ? "compact" : ""}`}>
      <button className="adp-act" title="Xem bài viết" onClick={onView}>
        <ExternalLink size={14} /><span>Xem</span>
      </button>
      <button
        className={`adp-act ${pinned ? "is-on" : ""}`}
        title={pinned ? "Gỡ ghim" : "Ghim bài"}
        onClick={pinned ? onUnpin : onPin}
      >
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{pinned ? "Gỡ ghim" : "Ghim"}</span>
      </button>
      <button
        className={`adp-act ${commentsOff ? "is-on" : ""}`}
        title={commentsOff ? "Bật bình luận" : "Tắt bình luận"}
        onClick={onCommentsToggle}
      >
        {commentsOff ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
        <span>{commentsOff ? "Mở BL" : "Tắt BL"}</span>
      </button>
      <button
        className={`adp-act ${isLocked ? "is-danger-on" : ""}`}
        title={isLocked ? "Mở khóa" : "Khóa"}
        onClick={onLockToggle}
      >
        {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
        <span>{isLocked ? "Mở khóa" : "Khóa"}</span>
      </button>
      <button className="adp-act is-danger" title="Xóa" onClick={onDelete}>
        <Trash2 size={14} /><span>Xóa</span>
      </button>
    </div>
  );
}


function PostDetailModal({
  row, onClose, onDelete, onLockToggle, onCommentsToggle, onPin, onUnpin,
}: {
  row: AdminPostRow; onClose: () => void;
  onDelete: () => void; onLockToggle: () => void; onCommentsToggle: () => void;
  onPin: () => void; onUnpin: () => void;
}) {
  useBodyScrollLock(true);
  return (
    <div className="adp-modal-backdrop" onClick={onClose}>
      <div className="adp-modal adp-post-view" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">{row.id}</div>
            <div className="adp-modal-time">{formatTime(row.created_at)}</div>
          </div>
          <button className="adp-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="adp-pv-body">
          <aside className="adp-pv-author">
            <div className="adp-avatar adp-avatar-lg">
              {row.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(row.avatar, 64)} alt={row.username} /> : <span>{row.username[0]?.toUpperCase()}</span>}
            </div>
            <div className="adp-pv-name">{row.username}</div>
            <div className="adp-pv-sub">{row.user_id}</div>
            <StatusBadge status={row.status} />
            <div className="adp-modal-metrics" style={{ width: "100%", gridTemplateColumns: "1fr 1fr" }}>
              <MetricChip icon={<Heart size={14} />} label="Thích" value={row.likes} />
              <MetricChip icon={<MessageCircle size={14} />} label="BL" value={row.comments} />
            </div>
          </aside>

          <div className="adp-pv-main">
            {row.content && <div className="adp-pv-text">{row.content}</div>}
            {row.image_urls && row.image_urls.length > 0 && (
              <div className="adp-pv-media">
                {row.image_urls.map((u, i) => <img loading="lazy" decoding="async" key={i} src={u} alt="" />)}
              </div>
            )}
            {row.video_url && (
              <video
                controlsList="nodownload"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                className="adp-modal-video"
                src={row.video_url}
                controls
              />
            )}
          </div>
        </div>

        <footer className="adp-modal-actions">
          <RowActions
            row={row}
            onView={() => {}}
            onDelete={onDelete}
            onLockToggle={onLockToggle}
            onCommentsToggle={onCommentsToggle}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        </footer>
      </div>
    </div>
  );
}


function MetricChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="adp-metric">
      <div className="adp-metric-icon">{icon}</div>
      <div>
        <div className="adp-metric-value">{fmt(value)}</div>
        <div className="adp-metric-label">{label}</div>
      </div>
    </div>
  );
}

function PinDialog({
  row, onCancel, onPick,
}: { row: AdminPostRow; onCancel: () => void; onPick: (hours: number) => void }) {
  useBodyScrollLock(true);
  return (
    <div className="adp-modal-backdrop" onClick={onCancel}>
      <div className="adp-dialog" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <div className="adp-dialog-title">Ghim bài viết</div>
        <div className="adp-dialog-desc">Chọn thời gian ghim — bài <b>{row.id}</b> sẽ tự gỡ ghim sau thời gian này.</div>
        <div className="adp-pin-grid">
          {PIN_OPTIONS.map((h) => (
            <button key={h} className="adp-pin-opt" onClick={() => onPick(h)}>
              {h} giờ
            </button>
          ))}
        </div>
        <div className="adp-dialog-foot">
          <button className="adp-btn ghost" onClick={onCancel}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title, message, confirmLabel, danger, onCancel, onConfirm,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useBodyScrollLock(true);
  return (
    <div className="adp-modal-backdrop" onClick={onCancel}>
      <div className="adp-dialog" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <div className="adp-dialog-title">{title}</div>
        <div className="adp-dialog-desc">{message}</div>
        <div className="adp-dialog-foot">
          <button className="adp-btn ghost" onClick={onCancel}>Hủy</button>
          <button className={`adp-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "...")[] = [];
  const push = (n: number | "...") => { if (out[out.length - 1] !== n) out.push(n); };
  push(1);
  if (current > 3) push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) push(i);
  if (current < total - 2) push("...");
  push(total);
  return out;
}



/* ---------------- Styles ---------------- */

function PostsStyles() {
  return (
    <style>{`
.adp-wrap { display: flex; flex-direction: column; gap: 14px; }

.adp-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.adp-search { position: relative; flex: 1; min-width: 240px; display: flex; align-items: center; gap: 8px; background: var(--adm1-surface); border: 1px solid var(--adm1-border); border-radius: 10px; padding: 0 12px; }
.adp-search input { flex: 1; background: transparent; border: 0; outline: 0; color: var(--adm1-text); font-size: 0.88rem; padding: 10px 0; }
.adp-search svg { color: var(--adm1-text-dim); }
.adp-search-clear { background: transparent; border: 0; color: var(--adm1-text-dim); cursor: pointer; padding: 2px; }

.adp-filter { display: inline-flex; align-items: center; gap: 6px; background: var(--adm1-surface); border: 1px solid var(--adm1-border); border-radius: 10px; padding: 0 10px; color: var(--adm1-text-dim); }
.adp-filter select { background: transparent; border: 0; color: var(--adm1-text); font-size: 0.85rem; padding: 9px 4px; outline: 0; }
.adp-filter select option { background: #11141b; }

.adp-refresh { display: inline-flex; align-items: center; gap: 6px; background: var(--adm1-surface); border: 1px solid var(--adm1-border); color: var(--adm1-text); padding: 9px 12px; border-radius: 10px; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.adp-refresh:hover { border-color: var(--adm1-accent); }
.adp-refresh:disabled { opacity: 0.6; cursor: wait; }
.spin { animation: adp-spin 1s linear infinite; }
@keyframes adp-spin { to { transform: rotate(360deg); } }


.adp-note { font-size: 0.78rem; color: var(--adm1-text-dim); padding: 8px 12px; background: rgba(96,165,250,0.06); border: 1px dashed rgba(96,165,250,0.3); border-radius: 10px; }

/* Table */
.adp-table-wrap { background: var(--adm1-surface); border: 1px solid var(--adm1-border); border-radius: 14px; overflow: hidden; }
.adp-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; table-layout: fixed; }
.adp-table thead th { text-align: left; padding: 11px 12px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--adm1-text-dim); border-bottom: 1px solid var(--adm1-border); background: rgba(255,255,255,0.02); }
.adp-table tbody td { padding: 12px; border-bottom: 1px solid var(--adm1-border); vertical-align: middle; }
.adp-table tbody tr:last-child td { border-bottom: 0; }
.adp-row { cursor: pointer; transition: background .12s; }
.adp-row:hover { background: rgba(255,255,255,0.03); }
.adp-table .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--adm1-text); white-space: nowrap; }
.adp-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #93c5fd; font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adp-time { color: var(--adm1-text-dim); font-size: 0.78rem; white-space: nowrap; }
.adp-content { color: var(--adm1-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-empty-row { text-align: center; color: var(--adm1-text-dim); padding: 36px 12px !important; }

/* Column widths — rebalanced after removing Views & Gifts */
.adp-table .col-id      { width: 9%;  }
.adp-table .col-time    { width: 11%; }
.adp-table .col-user    { width: 16%; }
.adp-table .col-content { width: auto; }
.adp-table .col-metric  { width: 5%;  }
.adp-table .col-status  { width: 10%; }
.adp-table .col-actions { width: 22%; }


.adp-user { display: flex; align-items: center; gap: 9px; }
.adp-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, var(--adm1-accent), var(--adm1-accent-2)); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.78rem; flex-shrink: 0; overflow: hidden; }
.adp-avatar img { width: 100%; height: 100%; object-fit: cover; }
.adp-avatar-lg { width: 46px; height: 46px; font-size: 1.05rem; }
.adp-user-meta { line-height: 1.25; min-width: 0; }
.adp-username { font-weight: 700; color: #fff; font-size: 0.85rem; }
.adp-userid { font-size: 0.7rem; color: var(--adm1-text-dim); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.adp-badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; border: 1px solid; white-space: nowrap; }

/* Actions */
.adp-actions { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.adp-act { display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; background: rgba(255,255,255,0.04); border: 1px solid var(--adm1-border); border-radius: 7px; color: var(--adm1-text); font-size: 0.72rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.adp-act:hover { border-color: var(--adm1-accent); color: #fff; }
.adp-act.is-on { background: rgba(79,140,255,0.18); border-color: var(--adm1-accent); color: #c7ddff; }
.adp-act.is-danger { color: #fca5a5; }
.adp-act.is-danger:hover { background: rgba(239,68,68,0.12); border-color: #ef4444; }
.adp-act.is-danger-on { background: rgba(239,68,68,0.2); border-color: #ef4444; color: #fecaca; }
.adp-actions.compact .adp-act span { display: none; }

/* Mobile cards */
.adp-cards { display: none; padding: 8px; gap: 10px; flex-direction: column; }
.adp-card { background: rgba(255,255,255,0.02); border: 1px solid var(--adm1-border); border-radius: 12px; padding: 12px; cursor: pointer; }
.adp-card:hover { border-color: var(--adm1-accent); }
.adp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.adp-card-content { font-size: 0.86rem; color: var(--adm1-text); line-height: 1.45; margin-bottom: 8px; }
.adp-card-metrics { display: flex; gap: 14px; color: var(--adm1-text-dim); font-size: 0.78rem; margin-bottom: 10px; }
.adp-card-metrics span { display: inline-flex; align-items: center; gap: 4px; }
.adp-card-actions { display: flex; }
.adp-empty-card { padding: 28px; text-align: center; color: var(--adm1-text-dim); font-size: 0.85rem; }

@media (max-width: 900px) {
  .adp-table { display: none; }
  .adp-cards { display: flex; }
}

/* Modal */
.adp-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; animation: adp-fade .15s ease; }
@keyframes adp-fade { from { opacity: 0; } to { opacity: 1; } }
.adp-modal { width: 100%; max-width: 720px; max-height: 90vh; display: flex; flex-direction: column; background: var(--adm1-bg-2); border: 1px solid var(--adm1-border); border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.5); }
.adp-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--adm1-border); }
.adp-modal-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; color: #93c5fd; font-size: 0.9rem; }
.adp-modal-time { font-size: 0.78rem; color: var(--adm1-text-dim); margin-top: 2px; }
.adp-modal-close { background: transparent; border: 0; color: var(--adm1-text-dim); cursor: pointer; padding: 6px; border-radius: 6px; }
.adp-modal-close:hover { background: rgba(255,255,255,0.06); color: #fff; }
.adp-modal-body { overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.adp-modal-author { display: flex; align-items: center; gap: 12px; }
.adp-modal-content { color: var(--adm1-text); font-size: 0.95rem; line-height: 1.55; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; }
.adp-modal-media { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.adp-modal-media img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; }
.adp-modal-video { width: 100%; border-radius: 10px; max-height: 360px; background: #000; }
.adp-modal-metrics { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
@media (min-width: 540px) { .adp-modal-metrics { grid-template-columns: repeat(4, minmax(0,1fr)); } }
.adp-metric { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--adm1-border); border-radius: 10px; background: rgba(255,255,255,0.02); }
.adp-metric-icon { width: 30px; height: 30px; border-radius: 8px; background: rgba(79,140,255,0.18); color: #93c5fd; display: inline-flex; align-items: center; justify-content: center; }
.adp-metric-value { font-weight: 800; color: #fff; font-size: 1rem; }
.adp-metric-label { font-size: 0.7rem; color: var(--adm1-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }

.adp-section h4 { margin: 0 0 8px; font-size: 0.85rem; font-weight: 700; color: var(--adm1-text); }
.adp-gifters { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px; }
.adp-gifter { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--adm1-border); border-radius: 8px; background: rgba(255,255,255,0.02); }
.adp-gifter-amount { margin-left: auto; font-weight: 700; color: #fbbf24; font-size: 0.82rem; }
.adp-muted { color: var(--adm1-text-dim); font-size: 0.85rem; }

.adp-modal-actions { padding: 12px 18px; border-top: 1px solid var(--adm1-border); background: rgba(255,255,255,0.02); display: flex; flex-wrap: wrap; gap: 4px; }

/* Dialog */
.adp-dialog { width: 100%; max-width: 420px; background: var(--adm1-bg-2); border: 1px solid var(--adm1-border); border-radius: 14px; padding: 20px; }
.adp-dialog-title { font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 6px; }
.adp-dialog-desc { font-size: 0.85rem; color: var(--adm1-text-dim); line-height: 1.5; margin-bottom: 16px; }
.adp-dialog-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.adp-pin-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.adp-pin-opt { padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--adm1-border); border-radius: 10px; color: var(--adm1-text); font-weight: 700; cursor: pointer; font-size: 0.88rem; }
.adp-pin-opt:hover { border-color: var(--adm1-accent); background: rgba(79,140,255,0.14); color: #fff; }
.adp-btn { padding: 9px 14px; border-radius: 9px; font-size: 0.85rem; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
.adp-btn.ghost { background: transparent; color: var(--adm1-text); border-color: var(--adm1-border); }
.adp-btn.ghost:hover { background: rgba(255,255,255,0.05); }
.adp-btn.primary { background: linear-gradient(135deg, var(--adm1-accent), var(--adm1-accent-2)); color: #fff; }
.adp-btn.danger { background: #dc2626; color: #fff; }
.adp-btn.danger:hover { background: #b91c1c; }
`}</style>
  );
}
