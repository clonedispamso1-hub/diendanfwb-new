import { useMemo, useState } from "react";
import {
  Search, RefreshCw, Eye, Trash2, Lock, Unlock, ExternalLink, MessageCircle, Heart, X,
} from "lucide-react";
import { toast } from "sonner";
import { MOCK_COMMENTS, type CommentRow, type CommentStatus } from "./mock-data";
import { LockedIcon } from "./ReputationBadge";
import { pushAudit } from "./audit-log";

type Filter = "all" | "normal" | "locked" | "reported";
type SearchBy = "user" | "id" | "content";
type TimeRange = "today" | "7d" | "30d" | "all";

const STATUS_META: Record<CommentStatus, { label: string; color: string; bg: string }> = {
  normal:   { label: "Bình thường", color: "#9ca3af", bg: "rgba(156,163,175,0.15)" },
  locked:   { label: "🚫 Đã khóa",   color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  reported: { label: "⚠️ Bị báo cáo", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Vừa xong";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return d.toLocaleString("vi-VN");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function timeCutoff(range: TimeRange): number | null {
  if (range === "all") return null;
  if (range === "today") {
    const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
  }
  if (range === "7d") return Date.now() - 7 * 86400_000;
  return Date.now() - 30 * 86400_000;
}

export function CommentsManager() {
  const [rows, setRows] = useState<CommentRow[]>(MOCK_COMMENTS);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchBy, setSearchBy] = useState<SearchBy>("content");
  const [q, setQ] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const [detail, setDetail] = useState<CommentRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<CommentRow | null>(null);

  const filtered = useMemo(() => {
    const cutoff = timeCutoff(range);
    const qn = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (cutoff && new Date(r.createdAt).getTime() < cutoff) return false;
      if (!qn) return true;
      if (searchBy === "user") return r.user.username.toLowerCase().includes(qn) || r.user.uid.toLowerCase().includes(qn);
      if (searchBy === "id") return r.id.toLowerCase().includes(qn);
      return r.content.toLowerCase().includes(qn);
    });
  }, [rows, filter, q, searchBy, range]);

  const counts = useMemo(() => ({
    all: rows.length,
    normal: rows.filter((r) => r.status === "normal").length,
    locked: rows.filter((r) => r.status === "locked").length,
    reported: rows.filter((r) => r.status === "reported").length,
  }), [rows]);

  const setStatus = (id: string, status: CommentStatus, actionLabel: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    pushAudit({ admin: "admin", action: actionLabel, target: `Bình luận ${id}` });
    toast.success(actionLabel);
  };

  const doDelete = (r: CommentRow) => {
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    pushAudit({ admin: "admin", action: "Xóa bình luận", target: `Bình luận ${r.id}` });
    toast.success(`Đã xóa bình luận ${r.id}`);
    setConfirmDel(null);
    setDetail(null);
  };

  return (
    <div className="rd-page">
      {/* Toolbar */}
      <div className="rd-toolbar">
        <div className="rd-search">
          <Search size={14} />
          <select value={searchBy} onChange={(e) => setSearchBy(e.target.value as SearchBy)}>
            <option value="content">Theo nội dung</option>
            <option value="user">Theo User</option>
            <option value="id">Theo ID</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm kiếm realtime..."
          />
          {q && (
            <button className="rd-search-clear" onClick={() => setQ("")} aria-label="Xóa">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="rd-range">
          {(["today", "7d", "30d", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              className={`rd-chip ${range === r ? "is-active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "today" ? "Hôm nay" : r === "7d" ? "7 ngày" : r === "30d" ? "30 ngày" : "Tất cả"}
            </button>
          ))}
        </div>

        <button className="rd-refresh" onClick={() => toast("Đã làm mới")}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>

      {/* Filter tabs */}
      <div className="rd-filter-row">
        {([
          ["all", "Tất cả", counts.all],
          ["normal", "Bình thường", counts.normal],
          ["locked", "Đã khóa", counts.locked],
          ["reported", "Bị báo cáo", counts.reported],
        ] as [Filter, string, number][]).map(([k, label, c]) => (
          <button
            key={k}
            className={`rd-filter ${filter === k ? "is-active" : ""}`}
            onClick={() => setFilter(k)}
          >
            {label} <span className="rd-filter-count">{c}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rd-table-wrap">
        <table className="rd-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Người bình luận</th>
              <th>Bài viết gốc</th>
              <th>Nội dung</th>
              <th>Thời gian</th>
              <th className="num">❤️</th>
              <th>Trạng thái</th>
              <th className="rd-col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="rd-empty">Không có bình luận phù hợp.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setDetail(r)} className="rd-row">
                <td className="rd-id">{r.id}</td>
                <td>
                  <div className="rd-user">
                    <div className="rd-avatar">{r.user.username[0]?.toUpperCase()}</div>
                    <div>
                      <div className="rd-username">
                        {r.user.username}
                        <LockedIcon uid={r.user.uid} />
                      </div>
                      <div className="rd-uid">{r.user.uid}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="rd-post-ref">
                    <div className="rd-post-title">{truncate(r.postTitle, 30)}</div>
                    <div className="rd-uid">{r.postId}</div>
                  </div>
                </td>
                <td className="rd-content">{truncate(r.content, 60)}</td>
                <td className="rd-time">{formatTime(r.createdAt)}</td>
                <td className="num">{r.likes}</td>
                <td>
                  <span
                    className="rd-badge"
                    style={{
                      color: STATUS_META[r.status].color,
                      background: STATUS_META[r.status].bg,
                      borderColor: STATUS_META[r.status].color + "55",
                    }}
                  >
                    {STATUS_META[r.status].label}
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="rd-actions">
                    <button className="rd-act" onClick={() => setDetail(r)} title="Xem">
                      <Eye size={13} /><span>Xem</span>
                    </button>
                    {r.status === "locked" ? (
                      <button className="rd-act" onClick={() => setStatus(r.id, "normal", "Khôi phục bình luận")} title="Khôi phục">
                        <Unlock size={13} /><span>Khôi phục</span>
                      </button>
                    ) : (
                      <button className="rd-act is-warn" onClick={() => setStatus(r.id, "locked", "Khóa bình luận")} title="Khóa">
                        <Lock size={13} /><span>Khóa</span>
                      </button>
                    )}
                    <button className="rd-act is-danger" onClick={() => setConfirmDel(r)} title="Xóa">
                      <Trash2 size={13} /><span>Xóa</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="rd-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="rd-modal" onClick={(e) => e.stopPropagation()}>
            <button className="rd-modal-close" onClick={() => setDetail(null)}><X size={16} /></button>
            <h3>Chi tiết bình luận {detail.id}</h3>
            <div className="rd-detail-grid">
              <div><span className="rd-label">Người bình luận:</span> {detail.user.username} ({detail.user.uid})</div>
              <div><span className="rd-label">Bài viết gốc:</span> {detail.postTitle} ({detail.postId}) <ExternalLink size={12} /></div>
              <div><span className="rd-label">Thời gian:</span> {new Date(detail.createdAt).toLocaleString("vi-VN")}</div>
              <div><span className="rd-label">Lượt thích:</span> <Heart size={12} /> {detail.likes}</div>
            </div>
            <div className="rd-detail-content">
              <MessageCircle size={14} /> {detail.content}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Xóa bình luận?"
          message={`Bình luận ${confirmDel.id} sẽ bị xóa vĩnh viễn.`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => doDelete(confirmDel)}
        />
      )}
    </div>
  );
}

export function ConfirmDialog({
  title, message, onCancel, onConfirm, confirmLabel = "Xóa",
}: {
  title: string; message: string; onCancel: () => void; onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <div className="rd-modal-backdrop" onClick={onCancel}>
      <div className="rd-modal rd-confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="rd-modal-actions">
          <button className="rd-btn-ghost" onClick={onCancel}>Hủy</button>
          <button className="rd-btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
