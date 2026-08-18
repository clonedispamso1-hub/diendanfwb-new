import { fromLocalInput } from "@/lib/admin/scheduler";
import type { ScheduleValue } from "./ScheduleCard";

/** Chuyển state UI → tham số cho admin_scheduler_create / _update. */
export function scheduleArgs(v: ScheduleValue) {
  return {
    runAt: fromLocalInput(v.runAtLocal) ?? new Date().toISOString(),
    staggerMinutes: v.staggerMinutes,
    recurrence: v.recurrence,
    recurIntervalMinutes: v.recurrence === "minutes" ? v.recurIntervalMinutes : null,
    recurTime: v.recurrence === "daily" || v.recurrence === "weekly" ? v.recurTime : null,
    recurDays: v.recurrence === "weekly" ? v.recurDays : null,
    recurUntil: v.recurrence === "none" ? null : fromLocalInput(v.recurUntilLocal),
  };
}
