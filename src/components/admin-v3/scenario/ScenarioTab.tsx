// Tab "Kịch bản Up Bài" — Scenario Engine V2.
// Queue được tạo phía server (pg_cron chạy), bắt đầu sau +1 giờ, chia đều theo tốc độ.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, RefreshCw, Plus, Trash2, Pencil, X, Users, Clock } from "lucide-react";
import { ScenarioComposer, EMPTY_COMPOSER, type ComposerValue } from "./ScenarioComposer";
import { ClonePickerModal } from "./ClonePickerModal";
import { scenarioKeys, SCENARIO_QUERY_OPTIONS, useScenarioSync } from "@/lib/admin/scenario-keys";
import {
  scenarioList, scenarioSave, scenarioDeleteMany,
  scenarioDays, scenarioDaySetScenario, scenarioClones,
  scenarioRun, scenarioRuns, scenarioTasks, scenarioTaskUpdate, scenarioTaskDelete,
  scenarioPurgePending, buildSchedule,
  WEEKDAY_LABEL, WEEKDAY_ORDER, SPEED_LABEL, todayWeekday, todayLabel, fmtTime, STATUS_LABEL,
  type Scenario, type ScenarioTask, type SpeedMode,
} from "@/lib/admin/scenario";

const SPEEDS: SpeedMode[] = ["slow", "medium", "fast"];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ScenarioTab({ kind = "post" }: { kind?: "post" | "comment" }) {
  const sync = useScenarioSync();
  const [weekday, setWeekday] = useState<number>(todayWeekday());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<SpeedMode>("medium");
  const [femaleCount, setFemaleCount] = useState(0);
  const [maleCount, setMaleCount] = useState(0);
  const [pickedFemale, setPickedFemale] = useState<string[]>([]);
  const [pickedMale, setPickedMale] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | "male" | "female">(null);
  const [editor, setEditor] = useState<null | Scenario | "new">(null);

  const scenariosQ = useQuery({
    queryKey: scenarioKeys.posts(), queryFn: scenarioList, ...SCENARIO_QUERY_OPTIONS,
  });
  const daysQ = useQuery({
    queryKey: scenarioKeys.days(), queryFn: scenarioDays, ...SCENARIO_QUERY_OPTIONS,
  });
  const runsQ = useQuery({
    queryKey: scenarioKeys.runs(), queryFn: () => scenarioRuns(1), ...SCENARIO_QUERY_OPTIONS,
  });

  const scenarios = scenariosQ.data ?? [];
  const days = daysQ.data ?? [];
  // Job rác (đã hủy / đã xóa) không được hiển thị hàng đợi.
  const latestRun = runsQ.data?.[0] ?? null;
  const jobId =
    latestRun && latestRun.status !== "cancelled" && latestRun.status !== "deleted"
      ? latestRun.job_id
      : null;

  const tasksQ = useQuery({
    queryKey: scenarioKeys.tasks(jobId),
    queryFn: () => scenarioTasks(jobId as string),
    enabled: !!jobId,
    ...SCENARIO_QUERY_OPTIONS,
  });
  const tasks: ScenarioTask[] = jobId ? (tasksQ.data ?? []) : [];
  const loading =
    scenariosQ.isFetching || daysQ.isFetching || runsQ.isFetching || tasksQ.isFetching;

  const error = scenariosQ.error || daysQ.error || runsQ.error || tasksQ.error;
  useEffect(() => {
    if (error) toast.error((error as any)?.message || "Không tải được kịch bản");
  }, [error]);

  const day = useMemo(() => days.find((d) => d.weekday === weekday) ?? null, [days, weekday]);
  const quota = day?.clone_count ?? 0;

  // Mặc định: toàn bộ quota là clone nữ, admin có thể chỉnh lại.
  useEffect(() => {
    setFemaleCount(quota);
    setMaleCount(0);
    setPickedFemale([]);
    setPickedMale([]);
  }, [quota, weekday]);

  async function setScenarioForDay(id: string | null) {
    if (!day) return;
    try {
      await scenarioDaySetScenario(day.weekday, id);
      await sync();
    } catch (e: any) {
      toast.error(e?.message || "Lưu cấu hình thất bại");
      await sync();
    }
  }

  /** Bù random cho phần clone admin chưa chọn đủ. */
  async function resolveIds(gender: "male" | "female", picked: string[], need: number) {
    const keep = picked.slice(0, need);
    if (keep.length >= need) return keep;
    const all = await scenarioClones(gender);
    const rest = shuffle(all.map((c) => c.id).filter((id) => !keep.includes(id)));
    return [...keep, ...rest.slice(0, need - keep.length)];
  }

  async function run() {
    if (!day?.scenario_id) { toast.error("Chưa chọn kịch bản cho ngày này"); return; }
    const total = femaleCount + maleCount;
    if (total <= 0) { toast.error("Số clone phải lớn hơn 0"); return; }
    if (total > quota) { toast.error(`Tối đa ${quota} clone cho ${WEEKDAY_LABEL[weekday]}`); return; }

    setRunning(true);
    try {
      const [f, m] = await Promise.all([
        resolveIds("female", pickedFemale, femaleCount),
        resolveIds("male", pickedMale, maleCount),
      ]);
      const ids = [...f, ...m];
      if (ids.length < total) {
        toast.error("Không đủ clone trong hệ thống để random");
        return;
      }

      const start = new Date(Date.now() + 60 * 60 * 1000); // bắt đầu sau +1 giờ
      const id = await scenarioRun(weekday, day.scenario_id, ids, start.toISOString());

      // Áp lịch theo tốc độ đã chọn (chia đều, không trùng giờ).
      const created = await scenarioTasks(id);
      const times = buildSchedule(start, created.length, speed);
      for (let i = 0; i < created.length; i++) {
        const t = created[i];
        await scenarioTaskUpdate({
          taskId: t.task_id,
          gifUrl: t.gif_url,
          vipGifUrl: t.vip_gif_url,
          voiceToken: t.voice_token,
          runAt: times[i].toISOString(),
        });
      }

      await sync();
      toast.success(`Đã tạo hàng đợi — bắt đầu lúc ${fmtTime(start.toISOString())}`);
    } catch (e: any) {
      toast.error(e?.message || "Chạy kịch bản thất bại");
    } finally {
      setRunning(false);
    }
  }

  async function purge() {
    if (!confirm("Xóa TOÀN BỘ clone đang chờ (Pending)? Bài đã chạy xong và kịch bản vẫn được giữ.")) return;
    try {
      const n = await scenarioPurgePending();
      toast.success(`Đã xóa ${n} clone đang chờ`);
      await sync();
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    }
  }

  if (kind === "comment") {
    return (
      <div className="admv3-card p-6 text-center text-sm text-muted-foreground">
        Kịch bản Bình Luận sẽ phát triển sau khi Kịch bản Up Bài hoàn thiện.
      </div>
    );
  }

  return (
    <div className="admv3-card p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold">Kịch bản Up Bài</div>
        <div className="text-xs text-muted-foreground">{todayLabel()}</div>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={() => sync()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
        <button className="admv3-btn admv3-btn-ghost text-red-500" onClick={purge}>
          <Trash2 size={14} /> Xóa toàn bộ hàng chờ
        </button>
      </div>

      {/* Chọn thứ */}
      <div className="flex gap-1 flex-wrap">
        {WEEKDAY_ORDER.map((w) => (
          <button key={w} onClick={() => setWeekday(w)}
            className={`admv3-btn ${weekday === w ? "" : "admv3-btn-ghost"} text-xs`}>
            {WEEKDAY_LABEL[w]}
            {w === todayWeekday() && <span className="ml-1 text-[10px] opacity-70">• hôm nay</span>}
          </button>
        ))}
      </div>

      {/* Cấu hình */}
      <div className="grid sm:grid-cols-4 gap-2 items-end">
        <label className="block sm:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Kịch bản</div>
          <select className="admv3-input" value={day?.scenario_id ?? ""}
            onChange={(e) => setScenarioForDay(e.target.value || null)}>
            <option value="">— Chọn kịch bản —</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Clone nữ</div>
          <div className="flex gap-1">
            <input type="number" min={0} max={quota} className="admv3-input"
              value={femaleCount}
              onChange={(e) => setFemaleCount(Math.max(0, Number(e.target.value) || 0))} />
            <button className="admv3-btn admv3-btn-ghost" title="Chọn clone nữ"
              onClick={() => setPicker("female")}>
              <Users size={14} />{pickedFemale.length || ""}
            </button>
          </div>
        </label>

        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Clone nam</div>
          <div className="flex gap-1">
            <input type="number" min={0} max={quota} className="admv3-input"
              value={maleCount}
              onChange={(e) => setMaleCount(Math.max(0, Number(e.target.value) || 0))} />
            <button className="admv3-btn admv3-btn-ghost" title="Chọn clone nam"
              onClick={() => setPicker("male")}>
              <Users size={14} />{pickedMale.length || ""}
            </button>
          </div>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="rounded-md border px-2 py-1 text-muted-foreground">
          Số clone tối đa ({WEEKDAY_LABEL[weekday]}): <b className="text-foreground">{quota}</b>
        </span>
        <span className="rounded-md border px-2 py-1 text-muted-foreground">
          Chưa chọn thủ công → hệ thống tự random đủ số lượng
        </span>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Tốc độ</span>
          <select className="admv3-input w-auto" value={speed}
            onChange={(e) => setSpeed(e.target.value as SpeedMode)}>
            {SPEEDS.map((s) => <option key={s} value={s}>{SPEED_LABEL[s]}</option>)}
          </select>
        </label>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => setEditor("new")}>
          <Plus size={13} /> Kịch bản mới
        </button>
        <button className="admv3-btn admv3-btn-ghost" disabled={!day?.scenario_id}
          onClick={() => {
            const s = scenarios.find((x) => x.id === day?.scenario_id);
            if (s) setEditor(s);
          }}>
          <Pencil size={13} /> Sửa kịch bản
        </button>
        <button className="admv3-btn ml-auto" onClick={run} disabled={running}>
          <Play size={14} /> {running ? "Đang tạo…" : "CHẠY (bắt đầu sau 1 giờ)"}
        </button>
      </div>

      {/* Hàng đợi */}
      <div className="border rounded-lg divide-y">
        {tasks.map((t) => (
          <TaskRow key={t.task_id} task={t} onChanged={() => sync()} />
        ))}
        {!tasks.length && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {loading ? "Đang tải…" : "Chưa có hàng đợi. Chọn kịch bản rồi bấm CHẠY."}
          </div>
        )}
      </div>

      {picker && (
        <ClonePickerModal
          gender={picker}
          max={picker === "female" ? Math.max(femaleCount, 0) || quota : Math.max(maleCount, 0) || quota}
          initial={picker === "female" ? pickedFemale : pickedMale}
          onClose={() => setPicker(null)}
          onConfirm={(ids) => {
            if (picker === "female") setPickedFemale(ids); else setPickedMale(ids);
            setPicker(null);
          }}
        />
      )}

      {editor && (
        <ScenarioEditor
          scenario={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); sync(); }}
          onDeleted={() => { setEditor(null); sync(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Task row -------------------------------- */

function TaskRow({ task, onChanged }: { task: ScenarioTask; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() => toLocalInput(task.run_at));
  const [busy, setBusy] = useState(false);
  const pending = task.status === "pending";

  async function saveTime(v: string) {
    setTime(v);
    if (!v) return;
    setBusy(true);
    try {
      await scenarioTaskUpdate({
        taskId: task.task_id,
        gifUrl: task.gif_url,
        vipGifUrl: task.vip_gif_url,
        voiceToken: task.voice_token,
        runAt: new Date(v).toISOString(),
      });
      toast.success("Đã đổi giờ chạy");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Đổi giờ thất bại");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-2 text-xs hover:bg-muted/30">
      <div className="flex items-start gap-2">
        <img src={task.avatar || "/favicon.ico"} alt={task.username ?? "clone"}
          className="h-8 w-8 rounded-full object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">@{task.username ?? task.account_id.slice(0, 6)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${task.gender === "male" ? "bg-sky-500/15 text-sky-600" : "bg-pink-500/15 text-pink-600"}`}>
              {task.gender === "male" ? "Nam" : "Nữ"}
            </span>
            <span className="text-muted-foreground">{STATUS_LABEL[task.status] ?? task.status}</span>
            {pending ? (
              <label className="flex items-center gap-1 ml-auto">
                <Clock size={12} className="text-muted-foreground" />
                <input type="datetime-local" className="admv3-input w-auto text-[11px]"
                  value={time} disabled={busy} onChange={(e) => saveTime(e.target.value)} />
              </label>
            ) : (
              <span className="ml-auto text-muted-foreground">{fmtTime(task.run_at)}</span>
            )}
          </div>
          <div className="whitespace-pre-wrap break-words line-clamp-3 mt-0.5">
            {task.content || "(chưa có caption)"}
          </div>
          {pending && (
            <div className="flex gap-1 flex-wrap mt-1">
              <button className="admv3-btn admv3-btn-ghost text-[11px]" onClick={() => setOpen(true)}>
                <Pencil size={12} /> Sửa nội dung
              </button>
              <button className="admv3-btn admv3-btn-ghost admv3-btn-icon text-red-500" title="Xóa"
                onClick={async () => {
                  if (!confirm("Xóa clone này khỏi hàng đợi?")) return;
                  try { await scenarioTaskDelete(task.task_id); onChanged(); }
                  catch (e: any) { toast.error(e?.message || "Xóa thất bại"); }
                }}>
                <Trash2 size={12} />
              </button>
            </div>
          )}
          {task.error && <div className="text-red-500 mt-1">{task.error}</div>}
        </div>
      </div>

      {open && (
        <TaskEditor task={task} onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

function TaskEditor({ task, onClose, onSaved }: {
  task: ScenarioTask; onClose: () => void; onSaved: () => void;
}) {
  const [value, setValue] = useState<ComposerValue>({
    caption: task.content ?? "",
    imageUrls: task.image_urls ?? [],
    gifUrl: task.gif_url,
    vipGifUrl: task.vip_gif_url,
    voiceToken: task.voice_token,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await scenarioTaskUpdate({
        taskId: task.task_id,
        content: value.caption,
        imageUrls: value.imageUrls,
        gifUrl: value.gifUrl,
        vipGifUrl: value.vipGifUrl,
        voiceToken: value.voiceToken,
      });
      toast.success("Đã cập nhật");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Cập nhật thất bại");
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Nội dung của @${task.username ?? ""}`} onClose={onClose}>
      <ScenarioComposer value={value} onChange={setValue} />
      <div className="flex gap-2 pt-2">
        <button className="admv3-btn ml-auto" onClick={save} disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------- Scenario editor --------------------------- */

function ScenarioEditor({ scenario, onClose, onSaved, onDeleted }: {
  scenario: Scenario | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(scenario?.name ?? "");
  const [value, setValue] = useState<ComposerValue>(
    scenario
      ? {
          caption: scenario.caption ?? "",
          imageUrls: scenario.image_urls ?? [],
          gifUrl: scenario.gif_url,
          vipGifUrl: scenario.vip_gif_url,
          voiceToken: scenario.voice_token,
        }
      : EMPTY_COMPOSER,
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Nhập tên kịch bản"); return; }
    setBusy(true);
    try {
      await scenarioSave({
        id: scenario?.id ?? null,
        name: name.trim(),
        caption: value.caption,
        imageUrls: value.imageUrls,
        gifUrl: value.gifUrl,
        vipGifUrl: value.vipGifUrl,
        voiceToken: value.voiceToken,
      });
      toast.success("Đã lưu kịch bản");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally { setBusy(false); }
  }

  return (
    <Modal title={scenario ? "Sửa kịch bản" : "Kịch bản mới"} onClose={onClose}>
      <label className="block mb-2">
        <div className="text-xs text-muted-foreground mb-1">Tên kịch bản</div>
        <input className="admv3-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ScenarioComposer value={value} onChange={setValue} />
      <div className="flex gap-2 pt-2">
        {scenario && (
          <button className="admv3-btn admv3-btn-ghost text-red-500"
            onClick={async () => {
              if (!confirm("Xóa kịch bản này?")) return;
              try { await scenarioDeleteMany([scenario.id]); onDeleted(); }
              catch (e: any) { toast.error(e?.message || "Xóa thất bại"); }
            }}>
            <Trash2 size={13} /> Xóa
          </button>
        )}
        <button className="admv3-btn ml-auto" onClick={save} disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-3"
      onClick={onClose}>
      <div className="bg-background border rounded-xl w-full max-w-lg max-h-[88vh] overflow-auto p-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-semibold">{title}</div>
          <button className="ml-auto admv3-btn admv3-btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
