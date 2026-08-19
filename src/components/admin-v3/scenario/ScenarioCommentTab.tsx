// Tab "Kịch bản Bình Luận" — bám theo Job của Kịch bản Up Bài.
// Không tạo Job mới: mọi comment gắn vào Job Up Bài đang chờ / đang chạy.
// Hàng đợi nằm hoàn toàn trong PostgreSQL (pg_cron) — frontend không có timer / polling.
// Toàn bộ dữ liệu đọc qua React Query (staleTime = 0) và invalidate ngay sau mọi thao tác.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw, Play, Pause, X, Trash2, Users, MessageSquarePlus, Settings2, Plus,
} from "lucide-react";
import { ClonePickerModal } from "./ClonePickerModal";
import { WEEKDAY_LABEL, fmtTime } from "@/lib/admin/scenario";
import { scenarioKeys, SCENARIO_QUERY_OPTIONS, useScenarioSync } from "@/lib/admin/scenario-keys";
import {
  commentJobs, commentTasks, commentApply, commentClear, commentTaskDelete,
  commentTextList, commentTextAdd, commentTextDelete, commentSources, jobSetStatus,
  JOB_STATUS_LABEL, CMT_STATUS_LABEL, KIND_LABEL, gifUrlOf,
  type CommentJob, type CommentTask,
} from "@/lib/admin/scenario-comment";

/** Job rác: đã hủy / không còn bài để chạy → không hiển thị. */
function isLiveJob(j: CommentJob): boolean {
  if (j.status === "cancelled" || j.status === "deleted") return false;
  return j.post_total > 0;
}

export function ScenarioCommentTab() {
  const sync = useScenarioSync();
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);

  const jobsQ = useQuery({
    queryKey: scenarioKeys.commentJobs(),
    queryFn: () => commentJobs(30),
    ...SCENARIO_QUERY_OPTIONS,
  });
  const jobs = useMemo(() => (jobsQ.data ?? []).filter(isLiveJob), [jobsQ.data]);
  const loading = jobsQ.isFetching;

  useEffect(() => {
    if (jobsQ.error) {
      toast.error((jobsQ.error as any)?.message || "Không tải được danh sách Job Up Bài");
    }
  }, [jobsQ.error]);

  // Job bị xóa / hủy trong lúc đang mở → đóng panel, không giữ dữ liệu mồ côi.
  useEffect(() => {
    if (openJob && jobs.length && !jobs.some((j) => j.job_id === openJob)) setOpenJob(null);
  }, [jobs, openJob]);

  const current = useMemo(() => jobs.find((j) => j.job_id === openJob) ?? null, [jobs, openJob]);

  const tasksQ = useQuery({
    queryKey: scenarioKeys.commentTasks(openJob),
    queryFn: () => commentTasks(openJob as string),
    enabled: !!openJob && !!current,
    ...SCENARIO_QUERY_OPTIONS,
  });
  const tasks: CommentTask[] = openJob && current ? (tasksQ.data ?? []) : [];

  function selectJob(jobId: string) {
    setOpenJob((p) => (p === jobId ? null : jobId));
  }

  async function control(jobId: string, status: "pending" | "paused" | "cancelled") {
    if (status === "cancelled" && !confirm("Hủy Job Up Bài này? Toàn bộ comment chưa chạy cũng bị hủy.")) return;
    try {
      await jobSetStatus(jobId, status);
      toast.success(
        status === "pending" ? "Đã cho chạy" : status === "paused" ? "Đã tạm dừng" : "Đã hủy",
      );
      if (status === "cancelled" && openJob === jobId) setOpenJob(null);
    } catch (e: any) {
      toast.error(e?.message || "Thao tác thất bại");
    } finally {
      await sync();
    }
  }

  return (
    <div className="admv3-card p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold">Kịch bản Bình Luận</div>
        <span className="text-xs text-muted-foreground">
          Comment luôn bám theo Job Up Bài — không tạo Job mới
        </span>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={() => setLibrary(true)}>
          <MessageSquarePlus size={14} /> Thư viện câu comment
        </button>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => sync()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      {/* Danh sách Job Up Bài */}
      <div className="border rounded-lg divide-y">
        {jobs.map((j) => {
          const on = j.job_id === openJob;
          return (
            <div key={j.job_id} className={on ? "bg-primary/5" : ""}>
              <div
                className="flex items-center gap-2 p-2 text-xs cursor-pointer hover:bg-muted/30"
                onClick={() => selectJob(j.job_id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {j.title || j.scenario_name || "Kịch bản"}
                    {j.weekday !== null && (
                      <span className="ml-1 text-muted-foreground">
                        • {WEEKDAY_LABEL[j.weekday] ?? ""}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                    <span>{j.clone_count} clone</span>
                    <span>{j.post_total} bài</span>
                    <span>đã đăng {j.post_done}</span>
                    {j.run_at && <span>{fmtTime(j.run_at)}</span>}
                    {j.cmt_total > 0 && (
                      <span className="text-foreground">
                        {j.cmt_total} comment (chờ {j.cmt_waiting + j.cmt_pending} • xong {j.cmt_done}
                        {j.cmt_failed ? ` • lỗi ${j.cmt_failed}` : ""})
                      </span>
                    )}
                  </div>
                </div>

                <span className="rounded-full border px-2 py-0.5 text-[10px] shrink-0">
                  {JOB_STATUS_LABEL[j.status] ?? j.status}
                </span>

                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Chạy"
                    disabled={j.status === "pending" || j.status === "running"}
                    onClick={() => control(j.job_id, "pending")}>
                    <Play size={13} />
                  </button>
                  <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Tạm dừng"
                    disabled={j.status === "paused"}
                    onClick={() => control(j.job_id, "paused")}>
                    <Pause size={13} />
                  </button>
                  <button className="admv3-btn admv3-btn-ghost admv3-btn-icon text-red-500" title="Hủy"
                    onClick={() => control(j.job_id, "cancelled")}>
                    <X size={13} />
                  </button>
                  <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Cấu hình comment"
                    onClick={() => selectJob(j.job_id)}>
                    <Settings2 size={13} />
                  </button>
                </div>
              </div>

              {on && current && (
                <div className="border-t p-2 space-y-3">
                  <CommentConfig job={current} />
                  <QueueList tasks={tasks} loading={tasksQ.isFetching} />
                </div>
              )}
            </div>
          );
        })}

        {!jobs.length && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {loading ? "Đang tải…" : "Chưa có Job Up Bài nào đang chờ / đang chạy."}
          </div>
        )}
      </div>

      {library && <TextLibraryModal onClose={() => setLibrary(false)} />}
    </div>
  );
}

/* --------------------------- Cấu hình comment --------------------------- */

function CommentConfig({ job }: { job: CommentJob }) {
  const sync = useScenarioSync();
  const posts = Math.max(job.post_total, job.clone_count, 1);
  const [total, setTotal] = useState(posts * 5);
  const [pctGif, setPctGif] = useState(0);
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(5);
  const [accountMode, setAccountMode] = useState<"random" | "manual">("random");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | "male" | "female">(null);
  const [busy, setBusy] = useState(false);

  const sourcesQ = useQuery({
    queryKey: scenarioKeys.commentSources(),
    queryFn: commentSources,
    ...SCENARIO_QUERY_OPTIONS,
  });
  const sources = sourcesQ.data ?? { bot_texts: 0, gifs: 0 };

  const perPost = useMemo(() => {
    const base = Math.floor(total / posts);
    const extra = total % posts;
    return extra > 0 ? `${base}–${base + 1}` : `${base}`;
  }, [total, posts]);

  async function apply() {
    if (total <= 0) { toast.error("Số comment phải lớn hơn 0"); return; }
    setBusy(true);
    try {
      const n = await commentApply({
        jobId: job.job_id,
        total,
        pctGif,
        delayMin,
        delayMax,
        accountMode,
        accountIds,
      });
      toast.success(`Đã sinh ${n} comment vào hàng đợi`);
    } catch (e: any) {
      toast.error(e?.message || "Apply thất bại");
    } finally {
      setBusy(false);
      await sync();
    }
  }

  async function clear() {
    if (!confirm("Xóa toàn bộ comment chưa chạy của Job này?")) return;
    try {
      const n = await commentClear(job.job_id);
      toast.success(`Đã xóa ${n} comment`);
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    } finally {
      await sync();
    }
  }

  return (
    <div className="rounded-lg border p-2 space-y-2 text-xs">
      <div className="font-semibold">Cấu hình bình luận cho Job này</div>
      <div className="text-muted-foreground">
        {posts} bài • chia đều Round Robin ≈ {perPost} comment/bài • thư viện bot{" "}
        {sources.bot_texts} câu • GIF thường {sources.gifs}
      </div>

      <div className="grid sm:grid-cols-4 gap-2">
        <label className="block">
          <div className="text-muted-foreground mb-1">Tổng số clone comment</div>
          <input type="number" min={1} className="admv3-input" value={total}
            onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="block">
          <div className="text-muted-foreground mb-1">GIF thường %</div>
          <input type="number" min={0} max={100} className="admv3-input" value={pctGif}
            onChange={(e) => setPctGif(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
          <div className="text-[10px] text-muted-foreground mt-0.5">
            còn lại {100 - pctGif}% dùng BOT COMMENT
          </div>
        </label>
        <label className="block">
          <div className="text-muted-foreground mb-1">Delay tối thiểu (phút)</div>
          <input type="number" min={0} className="admv3-input" value={delayMin}
            onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="block">
          <div className="text-muted-foreground mb-1">Delay tối đa (phút)</div>
          <input type="number" min={0} className="admv3-input" value={delayMax}
            onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Clone comment</span>
          <select className="admv3-input w-auto" value={accountMode}
            onChange={(e) => setAccountMode(e.target.value as any)}>
            <option value="random">Ngẫu nhiên toàn bộ clone</option>
            <option value="manual">Chọn thủ công</option>
          </select>
        </label>
        {accountMode === "manual" && (
          <>
            <button className="admv3-btn admv3-btn-ghost" onClick={() => setPicker("female")}>
              <Users size={13} /> Clone nữ
            </button>
            <button className="admv3-btn admv3-btn-ghost" onClick={() => setPicker("male")}>
              <Users size={13} /> Clone nam
            </button>
            <span className="text-muted-foreground">Đã chọn {accountIds.length}</span>
          </>
        )}

        <button className="admv3-btn admv3-btn-ghost text-red-500 ml-auto" onClick={clear}>
          <Trash2 size={13} /> Xóa hàng đợi comment
        </button>
        <button className="admv3-btn" onClick={apply} disabled={busy}>
          <Play size={13} /> {busy ? "Đang tạo…" : "APPLY — sinh hàng đợi"}
        </button>
      </div>

      {picker && (
        <ClonePickerModal
          gender={picker}
          max={9999}
          initial={accountIds}
          onClose={() => setPicker(null)}
          onConfirm={(ids) => {
            setAccountIds((p) => Array.from(new Set([...p, ...ids])));
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Hàng đợi -------------------------------- */

function QueueList({ tasks, loading }: { tasks: CommentTask[]; loading: boolean }) {
  const sync = useScenarioSync();
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 p-2 border-b text-xs">
        <div className="font-semibold">Hàng đợi comment ({tasks.length})</div>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={() => sync()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
      </div>

      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Clone</th>
              <th className="px-2 py-1">Bài sẽ comment</th>
              <th className="px-2 py-1">Thời gian</th>
              <th className="px-2 py-1">Loại</th>
              <th className="px-2 py-1">Nội dung</th>
              <th className="px-2 py-1">Trạng thái</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map((t) => {
              const gif = gifUrlOf(t.content);
              const when =
                t.run_at ??
                (t.post_run_at
                  ? new Date(new Date(t.post_run_at).getTime() + t.delay_seconds * 1000).toISOString()
                  : null);
              return (
                <tr key={t.task_id} className="hover:bg-muted/20">
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <img src={t.avatar || "/favicon.ico"} alt=""
                        className="h-5 w-5 rounded-full object-cover" />
                      <span className="truncate">@{t.username ?? t.account_id.slice(0, 6)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">
                    Bài của @{t.author_username ?? "—"}
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    {when ? fmtTime(when) : `+${Math.round(t.delay_seconds / 60)} phút sau bài`}
                  </td>
                  <td className="px-2 py-1">{KIND_LABEL[t.kind] ?? t.kind}</td>
                  <td className="px-2 py-1 max-w-[220px]">
                    {gif ? (
                      <img src={gif} alt="gif" className="h-8 rounded" />
                    ) : (
                      <span className="line-clamp-2 break-words">{t.content}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span className={
                      t.status === "done" ? "text-emerald-600"
                        : t.status === "failed" ? "text-red-500"
                        : t.status === "cancelled" ? "text-muted-foreground"
                        : "text-amber-600"
                    }>
                      {CMT_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {t.error && <div className="text-red-500">{t.error}</div>}
                  </td>
                  <td className="px-2 py-1">
                    {(t.status === "waiting" || t.status === "pending") && (
                      <button className="admv3-btn admv3-btn-ghost admv3-btn-icon text-red-500"
                        title="Xóa"
                        onClick={async () => {
                          try { await commentTaskDelete(t.task_id); }
                          catch (e: any) { toast.error(e?.message || "Xóa thất bại"); }
                          finally { await sync(); }
                        }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!tasks.length && (
              <tr>
                <td colSpan={7} className="p-5 text-center text-muted-foreground">
                  {loading ? "Đang tải…" : "Chưa có comment. Cấu hình rồi bấm APPLY."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------- Thư viện câu comment ------------------------ */

function TextLibraryModal({ onClose }: { onClose: () => void }) {
  const sync = useScenarioSync();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const rowsQ = useQuery({
    queryKey: scenarioKeys.commentTexts(),
    queryFn: commentTextList,
    ...SCENARIO_QUERY_OPTIONS,
  });
  const rows = rowsQ.data ?? [];

  useEffect(() => {
    if (rowsQ.error) toast.error((rowsQ.error as any)?.message || "Không tải được thư viện");
  }, [rowsQ.error]);

  async function add() {
    const items = draft.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    setBusy(true);
    try {
      const n = await commentTextAdd(items);
      toast.success(`Đã thêm ${n} câu`);
      setDraft("");
    } catch (e: any) {
      toast.error(e?.message || "Thêm thất bại");
    } finally {
      setBusy(false);
      await sync();
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-3"
      onClick={onClose}>
      <div className="bg-background border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b">
          <div className="text-sm font-semibold">Thư viện câu bình luận ({rows.length})</div>
          <button className="ml-auto admv3-btn admv3-btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-3 border-b space-y-2">
          <textarea className="admv3-input min-h-[80px]" placeholder="Mỗi dòng 1 câu bình luận…"
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="admv3-btn" onClick={add} disabled={busy}>
            <Plus size={13} /> {busy ? "Đang thêm…" : "Thêm câu"}
          </button>
        </div>

        <div className="flex-1 overflow-auto divide-y text-xs">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="flex-1 break-words">{r.content}</span>
              <button className="admv3-btn admv3-btn-ghost admv3-btn-icon text-red-500"
                onClick={async () => {
                  try { await commentTextDelete([r.id]); }
                  catch (e: any) { toast.error(e?.message || "Xóa thất bại"); }
                  finally { await sync(); }
                }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {!rows.length && (
            <div className="p-5 text-center text-muted-foreground">Chưa có câu nào</div>
          )}
        </div>
      </div>
    </div>
  );
}
