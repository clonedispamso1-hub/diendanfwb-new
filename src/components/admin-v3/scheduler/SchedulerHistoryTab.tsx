// Tab "Lịch sử" — các task đã chạy (done/failed/cancelled) từ RPC admin_scheduler_history.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search } from "lucide-react";
import { schedulerHistory, fmtDateTime, type SchedulerHistoryRow } from "@/lib/admin/scheduler";

const PAGE = 20;

const KIND_LABEL: Record<string, string> = { post: "Đăng bài", comment: "Bình luận" };
const STATUS_LABEL: Record<string, string> = {
  done: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

export function SchedulerHistoryTab() {
  const [rows, setRows] = useState<SchedulerHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | "post" | "comment">("");
  const [status, setStatus] = useState<"" | "done" | "failed" | "cancelled">("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await schedulerHistory(300));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được lịch sử");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (status && r.status !== status) return false;
      if (!needle) return true;
      return [r.username, r.full_name, r.content, r.error]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [rows, q, kind, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="admv3-card p-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="admv3-input pl-7 w-56"
            placeholder="Tìm tài khoản / nội dung…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
          />
        </div>
        <select className="admv3-input w-36" value={kind}
          onChange={(e) => { setKind(e.target.value as any); setPage(0); }}>
          <option value="">Tất cả loại</option>
          <option value="post">Đăng bài</option>
          <option value="comment">Bình luận</option>
        </select>
        <select className="admv3-input w-40" value={status}
          onChange={(e) => { setStatus(e.target.value as any); setPage(0); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="done">Hoàn thành</option>
          <option value="failed">Thất bại</option>
          <option value="cancelled">Đã hủy</option>
        </select>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      {!view.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Chưa có lịch sử nào.
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {view.map((r) => (
            <div key={r.task_id} className="px-2 py-2 text-xs flex items-start gap-2">
              <span className="shrink-0 w-20 font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
              <span className="shrink-0 w-40 truncate">
                {r.full_name || r.username || r.account_id.slice(0, 8)}
              </span>
              <span className="flex-1 truncate">
                {(r.content ?? "").replace(/\[\[gif:[^\]]+\]\]/g, "[GIF]") || "—"}
                {r.error ? <span className="text-red-600"> · {r.error}</span> : null}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {fmtDateTime(r.finished_at ?? r.run_at)}
              </span>
              <span
                className={`shrink-0 w-20 text-right ${
                  r.status === "done" ? "text-emerald-600"
                    : r.status === "failed" ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <button className="admv3-btn admv3-btn-ghost" disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>Trước</button>
          <span className="text-muted-foreground">{page + 1}/{pages}</span>
          <button className="admv3-btn admv3-btn-ghost" disabled={page + 1 >= pages}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Sau</button>
        </div>
      )}
    </div>
  );
}
