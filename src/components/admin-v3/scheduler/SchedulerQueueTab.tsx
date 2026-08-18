// Tab "Hàng đợi" — danh sách lịch đang chờ/tạm dừng/thất bại.
// Dữ liệu lấy từ RPC admin_scheduler_list, làm mới 20s/lần (hoặc bấm Làm mới).
// Không dùng timer để chạy lịch — pg_cron phía server đảm nhiệm.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw, Search, Pause, Play, XCircle, Trash2, Pencil, Save, X,
} from "lucide-react";
import type { AccountLite } from "../second-accounts/InternalTools";
import {
  schedulerList, schedulerSetStatus, schedulerDelete, schedulerUpdate,
  fmtDateTime, recurrenceText, STATUS_LABEL, toLocalInput, fromLocalInput,
  WEEKDAYS,
  type JobStatus, type SchedulerJob, type Recurrence,
} from "@/lib/admin/scheduler";

const PAGE = 10;
const REFRESH_MS = 20_000;

const STATUS_FILTERS: Array<{ key: "" | JobStatus; label: string }> = [
  { key: "", label: "Tất cả" },
  { key: "pending", label: "Đang chờ" },
  { key: "running", label: "Đang chạy" },
  { key: "paused", label: "Tạm dừng" },
  { key: "failed", label: "Thất bại" },
  { key: "done", label: "Hoàn thành" },
  { key: "cancelled", label: "Đã hủy" },
];

export function SchedulerQueueTab({ accounts }: { accounts: AccountLite[] }) {
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"" | JobStatus>("");
  const [kind, setKind] = useState<"" | "post" | "comment">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SchedulerJob | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await schedulerList(status || null));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được hàng đợi");
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Làm mới định kỳ (chỉ refresh dữ liệu, không phải hẹn giờ chạy lịch).
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (kind && j.kind !== kind) return false;
      if (!term) return true;
      const acc = (j.accounts ?? []).map((a) => `${a.username ?? ""} ${a.full_name ?? ""}`).join(" ");
      return `${j.title ?? ""} ${j.content ?? ""} ${acc}`.toLowerCase().includes(term);
    });
  }, [jobs, kind, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  useEffect(() => { setPage(0); }, [q, kind, status]);

  async function act(fn: () => Promise<void>, ok: string) {
    try { await fn(); toast.success(ok); load(); }
    catch (e: any) { toast.error(e?.message || "Thao tác thất bại"); }
  }

  return (
    <div className="admv3-card p-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
          <input className="admv3-input w-64 pl-7" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm nội dung / tài khoản…" />
        </div>
        <select className="admv3-input w-40" value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="">Tất cả loại</option>
          <option value="post">Đăng bài</option>
          <option value="comment">Bình luận</option>
        </select>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button key={s.key || "all"}
              className={`admv3-btn ${status === s.key ? "" : "admv3-btn-ghost"} text-xs`}
              onClick={() => setStatus(s.key)}>{s.label}</button>
          ))}
        </div>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-2 py-2">Loại</th>
              <th className="px-2 py-2">Tài khoản</th>
              <th className="px-2 py-2">Nội dung</th>
              <th className="px-2 py-2">Thời gian</th>
              <th className="px-2 py-2">Lặp lại</th>
              <th className="px-2 py-2">Trạng thái</th>
              <th className="px-2 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((j) => (
              <tr key={j.job_id} className="hover:bg-muted/30 align-top">
                <td className="px-2 py-2 whitespace-nowrap">{j.kind === "post" ? "Đăng bài" : "Bình luận"}</td>
                <td className="px-2 py-2 max-w-[180px]">
                  <span className="line-clamp-2">
                    {(j.accounts ?? []).map((a) => `@${a.username ?? a.id?.slice(0, 6)}`).join(", ") || "—"}
                  </span>
                  {j.stagger_minutes > 0 && (
                    <div className="text-[10px] text-muted-foreground">cách nhau {j.stagger_minutes} phút</div>
                  )}
                </td>
                <td className="px-2 py-2 max-w-[240px]">
                  <span className="line-clamp-2 whitespace-pre-wrap break-words">
                    {(j.content || "").replace(/\[\[gif:[^\]]+\]\]/g, "[GIF]") || "(không có)"}
                  </span>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {fmtDateTime(j.next_task_at || j.run_at)}
                  <div className="text-[10px] text-muted-foreground">
                    chờ {j.pending_count} • xong {j.done_count} • lỗi {j.failed_count}
                  </div>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{recurrenceText(j)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {STATUS_LABEL[j.status]}
                  {j.last_error && <div className="text-[10px] text-red-500 line-clamp-2">{j.last_error}</div>}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Sửa"
                      onClick={() => setEditing(j)}><Pencil size={13} /></button>
                    {j.status === "paused" ? (
                      <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Tiếp tục"
                        onClick={() => act(() => schedulerSetStatus(j.job_id, "pending"), "Đã tiếp tục")}>
                        <Play size={13} />
                      </button>
                    ) : (
                      <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Tạm dừng"
                        onClick={() => act(() => schedulerSetStatus(j.job_id, "paused"), "Đã tạm dừng")}>
                        <Pause size={13} />
                      </button>
                    )}
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Hủy"
                      onClick={() => act(() => schedulerSetStatus(j.job_id, "cancelled"), "Đã hủy lịch")}>
                      <XCircle size={13} />
                    </button>
                    <button className="admv3-btn admv3-btn-ghost admv3-btn-icon text-red-500" title="Xóa"
                      onClick={() => { if (confirm("Xóa lịch này?")) act(() => schedulerDelete(j.job_id), "Đã xóa lịch"); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                {loading ? "Đang tải…" : "Không có lịch nào."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className="text-muted-foreground">{filtered.length} lịch</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="admv3-btn admv3-btn-ghost" disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>Trước</button>
          <span>{page + 1}/{pageCount}</span>
          <button className="admv3-btn admv3-btn-ghost" disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Sau</button>
        </div>
      </div>

      {editing && (
        <EditJobModal
          job={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Edit modal ------------------------------ */

function EditJobModal({
  job, accounts, onClose, onSaved,
}: {
  job: SchedulerJob;
  accounts: AccountLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(job.content ?? "");
  const [images, setImages] = useState((job.image_urls ?? []).join("\n"));
  const [gif, setGif] = useState(job.gif_url ?? "");
  const [voice, setVoice] = useState(job.voice_token ?? "");
  const [fb, setFb] = useState(job.facebook_url ?? "");
  const [zalo, setZalo] = useState(job.zalo_url ?? "");
  const [runAt, setRunAt] = useState(toLocalInput(job.run_at));
  const [stagger, setStagger] = useState(job.stagger_minutes ?? 0);
  const [picked, setPicked] = useState<string[]>(job.account_ids ?? []);
  const [recurrence, setRecurrence] = useState<Recurrence>(job.recurrence);
  const [interval, setInterval_] = useState(job.recur_interval_minutes ?? 60);
  const [recurTime, setRecurTime] = useState((job.recur_time ?? "09:00").slice(0, 5));
  const [days, setDays] = useState<number[]>(job.recur_days ?? []);
  const [until, setUntil] = useState(toLocalInput(job.recur_until));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!picked.length) { toast.error("Chưa chọn tài khoản"); return; }
    setBusy(true);
    try {
      await schedulerUpdate({
        jobId: job.job_id,
        runAt: fromLocalInput(runAt),
        content: content.trim() || null,
        imageUrls: images.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        gifUrl: gif.trim() || null,
        voiceToken: voice.trim() || null,
        facebookUrl: fb.trim() || null,
        zaloUrl: zalo.trim() || null,
        accounts: picked,
        postIds: job.post_ids ?? null,
        staggerMinutes: stagger,
        recurrence,
        recurIntervalMinutes: recurrence === "minutes" ? interval : null,
        recurTime: recurrence === "daily" || recurrence === "weekly" ? recurTime : null,
        recurDays: recurrence === "weekly" ? days : null,
        recurUntil: recurrence === "none" ? null : fromLocalInput(until),
      });
      toast.success("Đã cập nhật lịch");
      onSaved();
    } catch (e: any) { toast.error(e?.message || "Cập nhật thất bại"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3" onClick={onClose}>
      <div className="admv3-card p-3 w-full max-w-2xl max-h-[90vh] overflow-auto bg-background"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-semibold">Sửa lịch — {job.kind === "post" ? "Đăng bài" : "Bình luận"}</div>
          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon ml-auto" onClick={onClose}><X size={14} /></button>
        </div>

        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Nội dung / Caption</div>
          <textarea className="admv3-input" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
        </label>

        <label className="block mt-2">
          <div className="text-xs text-muted-foreground mb-1">Ảnh / Video — mỗi URL một dòng</div>
          <textarea className="admv3-input" rows={2} value={images} onChange={(e) => setImages(e.target.value)} />
        </label>

        <div className="grid sm:grid-cols-2 gap-2 mt-2">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">GIF URL</div>
            <input className="admv3-input" value={gif} onChange={(e) => setGif(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Voice token</div>
            <input className="admv3-input" value={voice} onChange={(e) => setVoice(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Link Facebook</div>
            <input className="admv3-input" value={fb} onChange={(e) => setFb(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Link Zalo</div>
            <input className="admv3-input" value={zalo} onChange={(e) => setZalo(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Thời gian chạy</div>
            <input type="datetime-local" className="admv3-input" value={runAt}
              onChange={(e) => setRunAt(e.target.value)} />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Khoảng cách giữa tài khoản (phút)</div>
            <input type="number" min={0} className="admv3-input" value={stagger}
              onChange={(e) => setStagger(Number(e.target.value) || 0)} />
          </label>
        </div>

        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">Tài khoản ({picked.length})</div>
          <div className="border rounded-lg max-h-[160px] overflow-auto divide-y">
            {accounts.map((a) => (
              <label key={a.id} className="px-2 py-1.5 flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40">
                <input type="checkbox" checked={picked.includes(a.id)}
                  onChange={() => setPicked((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])} />
                <span className="truncate">{a.full_name || a.username} • @{a.username}</span>
              </label>
            ))}
            {!accounts.length && <div className="p-3 text-xs text-muted-foreground">Không có tài khoản.</div>}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">Lặp lại</div>
          <div className="flex gap-1 flex-wrap">
            {(["none", "minutes", "daily", "weekly"] as Recurrence[]).map((r) => (
              <button key={r} className={`admv3-btn ${recurrence === r ? "" : "admv3-btn-ghost"} text-xs`}
                onClick={() => setRecurrence(r)}>
                {r === "none" ? "Không lặp" : r === "minutes" ? "Mỗi X phút" : r === "daily" ? "Hàng ngày" : "Theo thứ"}
              </button>
            ))}
          </div>
          {recurrence === "minutes" && (
            <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
              Mỗi <input type="number" min={1} className="admv3-input w-24" value={interval}
                onChange={(e) => setInterval_(Number(e.target.value) || 1)} /> phút
            </label>
          )}
          {(recurrence === "daily" || recurrence === "weekly") && (
            <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
              Giờ chạy <input type="time" className="admv3-input w-32" value={recurTime}
                onChange={(e) => setRecurTime(e.target.value)} />
            </label>
          )}
          {recurrence === "weekly" && (
            <div className="flex gap-1 flex-wrap mt-2">
              {WEEKDAYS.map((d, i) => (
                <button key={d} className={`admv3-btn ${days.includes(i) ? "" : "admv3-btn-ghost"} text-xs`}
                  onClick={() => setDays((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort())}>
                  {d}
                </button>
              ))}
            </div>
          )}
          {recurrence !== "none" && (
            <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
              Lặp đến <input type="datetime-local" className="admv3-input w-56" value={until}
                onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button className="admv3-btn admv3-btn-ghost" onClick={onClose}>Đóng</button>
          <button className="admv3-btn" onClick={save} disabled={busy}>
            <Save size={14} /> {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}
