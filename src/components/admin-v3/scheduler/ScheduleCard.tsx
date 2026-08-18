// Card "Lên lịch đăng bài / bình luận" — chỉ chọn thời gian & lặp lại.
// Việc chạy lịch do pg_cron + RPC admin_scheduler_* xử lý phía server.
import { CalendarClock, Timer, Repeat } from "lucide-react";
import {
  RECURRENCE_LABEL, WEEKDAYS, toLocalInput, type Recurrence,
} from "@/lib/admin/scheduler";

export type ScheduleValue = {
  mode: "now" | "schedule";
  runAtLocal: string;                 // datetime-local
  staggerMinutes: number;             // 0 = đăng cùng lúc
  recurrence: Recurrence;
  recurIntervalMinutes: number;
  recurTime: string;                  // "HH:MM"
  recurDays: number[];
  recurUntilLocal: string;
};

export const PRESET_MINUTES: Array<{ label: string; m: number }> = [
  { label: "Sau 5 phút", m: 5 },
  { label: "Sau 10 phút", m: 10 },
  { label: "Sau 15 phút", m: 15 },
  { label: "Sau 30 phút", m: 30 },
  { label: "Sau 1 giờ", m: 60 },
  { label: "Sau 2 giờ", m: 120 },
  { label: "Sau 6 giờ", m: 360 },
  { label: "Sau 12 giờ", m: 720 },
  { label: "Sau 24 giờ", m: 1440 },
];

const STAGGER_OPTIONS = [1, 3, 5, 10, 15, 30];

export function defaultSchedule(): ScheduleValue {
  return {
    mode: "now",
    runAtLocal: toLocalInput(new Date(Date.now() + 5 * 60_000)),
    staggerMinutes: 0,
    recurrence: "none",
    recurIntervalMinutes: 60,
    recurTime: "09:00",
    recurDays: [],
    recurUntilLocal: "",
  };
}

export function ScheduleCard({
  value,
  onChange,
  accountCount,
  title = "Lên lịch đăng bài",
  onSubmit,
  submitting,
  submitLabel = "Lên lịch",
}: {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  accountCount: number;
  title?: string;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });

  return (
    <div className="admv3-card p-3 mt-3">
      <div className="text-sm font-semibold flex items-center gap-2 mb-2">
        <CalendarClock size={15} /> {title}
      </div>

      {/* Chế độ */}
      <div className="text-xs text-muted-foreground mb-1">Chế độ</div>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="text-sm flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value.mode === "now"} onChange={() => set({ mode: "now" })} />
          Đăng ngay
        </label>
        <label className="text-sm flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value.mode === "schedule"} onChange={() => set({ mode: "schedule" })} />
          Đăng theo lịch
        </label>
      </div>

      {value.mode === "schedule" && (
        <>
          {/* Thời gian */}
          <div className="text-xs text-muted-foreground mb-1">Thời gian</div>
          <div className="flex gap-1 flex-wrap mb-2">
            {PRESET_MINUTES.map((p) => (
              <button
                key={p.m}
                type="button"
                className="admv3-btn admv3-btn-ghost text-xs"
                onClick={() => set({ runAtLocal: toLocalInput(new Date(Date.now() + p.m * 60_000)) })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            className="admv3-input w-full sm:w-64"
            value={value.runAtLocal}
            onChange={(e) => set({ runAtLocal: e.target.value })}
          />

          {/* Đăng cách nhau */}
          {accountCount > 1 && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Timer size={12} /> {accountCount} tài khoản
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={value.staggerMinutes === 0}
                    onChange={() => set({ staggerMinutes: 0 })} />
                  Đăng cùng lúc
                </label>
                <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={value.staggerMinutes > 0}
                    onChange={() => set({ staggerMinutes: 5 })} />
                  Đăng cách nhau
                </label>
                {value.staggerMinutes > 0 && (
                  <select
                    className="admv3-input w-28"
                    value={value.staggerMinutes}
                    onChange={(e) => set({ staggerMinutes: Number(e.target.value) })}
                  >
                    {STAGGER_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m} phút</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Lặp lại */}
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Repeat size={12} /> Lặp lại
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["none", "minutes", "daily", "weekly"] as Recurrence[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`admv3-btn ${value.recurrence === r ? "" : "admv3-btn-ghost"} text-xs`}
                  onClick={() => set({ recurrence: r })}
                >
                  {RECURRENCE_LABEL[r]}
                </button>
              ))}
            </div>

            {value.recurrence === "minutes" && (
              <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                Mỗi
                <input type="number" min={1} className="admv3-input w-24"
                  value={value.recurIntervalMinutes}
                  onChange={(e) => set({ recurIntervalMinutes: Number(e.target.value) || 1 })} />
                phút
              </label>
            )}

            {(value.recurrence === "daily" || value.recurrence === "weekly") && (
              <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                Giờ chạy
                <input type="time" className="admv3-input w-32" value={value.recurTime}
                  onChange={(e) => set({ recurTime: e.target.value })} />
              </label>
            )}

            {value.recurrence === "weekly" && (
              <div className="flex gap-1 flex-wrap mt-2">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    className={`admv3-btn ${value.recurDays.includes(i) ? "" : "admv3-btn-ghost"} text-xs`}
                    onClick={() =>
                      set({
                        recurDays: value.recurDays.includes(i)
                          ? value.recurDays.filter((x) => x !== i)
                          : [...value.recurDays, i].sort(),
                      })
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {value.recurrence !== "none" && (
              <label className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                Lặp đến (tuỳ chọn)
                <input type="datetime-local" className="admv3-input w-56" value={value.recurUntilLocal}
                  onChange={(e) => set({ recurUntilLocal: e.target.value })} />
              </label>
            )}
          </div>

          <div className="flex justify-end mt-3">
            <button type="button" className="admv3-btn" onClick={onSubmit} disabled={submitting}>
              <CalendarClock size={14} /> {submitting ? "Đang tạo lịch…" : submitLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
