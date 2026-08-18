// Scheduler (đăng bài / bình luận hẹn giờ) — chỉ gọi các RPC đã có trong
// docs/sql/2026-08-17_SCHEDULER.sql. Toàn bộ việc chạy lịch do pg_cron phía
// server đảm nhiệm; frontend KHÔNG dùng setTimeout/setInterval để hẹn giờ.
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type JobKind = "post" | "comment";
export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled" | "paused";
export type Recurrence = "none" | "minutes" | "daily" | "weekly";

export type SchedulerAccount = { id: string; username: string | null; full_name: string | null };

export type SchedulerJob = {
  job_id: string;
  kind: JobKind;
  status: JobStatus;
  title: string | null;
  content: string | null;
  image_urls: string[] | null;
  gif_url: string | null;
  voice_token: string | null;
  facebook_url: string | null;
  zalo_url: string | null;
  account_ids: string[];
  post_ids: string[];
  run_at: string;
  stagger_minutes: number;
  recurrence: Recurrence;
  recur_interval_minutes: number | null;
  recur_time: string | null;
  recur_days: number[] | null;
  recur_until: string | null;
  runs_count: number;
  last_error: string | null;
  created_at: string;
  accounts: SchedulerAccount[];
  pending_count: number;
  done_count: number;
  failed_count: number;
  next_task_at: string | null;
};

export type SchedulerHistoryRow = {
  task_id: string;
  job_id: string;
  kind: JobKind;
  account_id: string;
  username: string | null;
  full_name: string | null;
  post_id: string | null;
  content: string | null;
  run_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: "done" | "failed" | "cancelled";
  error: string | null;
  result_id: string | null;
};

export type CreateJobInput = {
  kind: JobKind;
  accounts: string[];
  runAt: string;                 // ISO
  content?: string | null;
  imageUrls?: string[] | null;
  gifUrl?: string | null;
  voiceToken?: string | null;
  facebookUrl?: string | null;
  zaloUrl?: string | null;
  postIds?: string[] | null;
  staggerMinutes?: number;
  recurrence?: Recurrence;
  recurIntervalMinutes?: number | null;
  recurTime?: string | null;     // "HH:MM"
  recurDays?: number[] | null;   // 0=CN..6=T7
  recurUntil?: string | null;    // ISO
  title?: string | null;
};

export async function schedulerCreate(i: CreateJobInput): Promise<string> {
  const { data, error } = await sb.rpc("admin_scheduler_create", {
    p_kind: i.kind,
    p_accounts: i.accounts,
    p_run_at: i.runAt,
    p_content: i.content ?? null,
    p_image_urls: i.imageUrls?.length ? i.imageUrls : null,
    p_gif_url: i.gifUrl ?? null,
    p_voice_token: i.voiceToken ?? null,
    p_facebook_url: i.facebookUrl ?? null,
    p_zalo_url: i.zaloUrl ?? null,
    p_post_ids: i.postIds?.length ? i.postIds : null,
    p_stagger_minutes: i.staggerMinutes ?? 0,
    p_recurrence: i.recurrence ?? "none",
    p_recur_interval_minutes: i.recurIntervalMinutes ?? null,
    p_recur_time: i.recurTime ?? null,
    p_recur_days: i.recurDays?.length ? i.recurDays : null,
    p_recur_until: i.recurUntil ?? null,
    p_title: i.title ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function schedulerList(status?: JobStatus | null): Promise<SchedulerJob[]> {
  const { data, error } = await sb.rpc("admin_scheduler_list", { p_status: status ?? null });
  if (error) throw error;
  return (data ?? []) as SchedulerJob[];
}

export async function schedulerHistory(limit = 200): Promise<SchedulerHistoryRow[]> {
  const { data, error } = await sb.rpc("admin_scheduler_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as SchedulerHistoryRow[];
}

export type UpdateJobInput = {
  jobId: string;
  runAt?: string | null;
  content?: string | null;
  imageUrls?: string[] | null;
  gifUrl?: string | null;
  voiceToken?: string | null;
  facebookUrl?: string | null;
  zaloUrl?: string | null;
  accounts?: string[] | null;
  postIds?: string[] | null;
  staggerMinutes?: number | null;
  recurrence?: Recurrence | null;
  recurIntervalMinutes?: number | null;
  recurTime?: string | null;
  recurDays?: number[] | null;
  recurUntil?: string | null;
};

export async function schedulerUpdate(i: UpdateJobInput): Promise<void> {
  const { error } = await sb.rpc("admin_scheduler_update", {
    p_job: i.jobId,
    p_run_at: i.runAt ?? null,
    p_content: i.content ?? null,
    p_image_urls: i.imageUrls ?? null,
    p_gif_url: i.gifUrl ?? null,
    p_voice_token: i.voiceToken ?? null,
    p_facebook_url: i.facebookUrl ?? null,
    p_zalo_url: i.zaloUrl ?? null,
    p_accounts: i.accounts ?? null,
    p_post_ids: i.postIds ?? null,
    p_stagger_minutes: i.staggerMinutes ?? null,
    p_recurrence: i.recurrence ?? null,
    p_recur_interval_minutes: i.recurIntervalMinutes ?? null,
    p_recur_time: i.recurTime ?? null,
    p_recur_days: i.recurDays ?? null,
    p_recur_until: i.recurUntil ?? null,
  });
  if (error) throw error;
}

export async function schedulerSetStatus(jobId: string, status: "pending" | "paused" | "cancelled") {
  const { error } = await sb.rpc("admin_scheduler_set_status", { p_job: jobId, p_status: status });
  if (error) throw error;
}

export async function schedulerDelete(jobId: string) {
  const { error } = await sb.rpc("admin_scheduler_delete", { p_job: jobId });
  if (error) throw error;
}

/* ----------------------------- helpers UI ------------------------------ */

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Đang chờ",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Không lặp",
  minutes: "Mỗi X phút",
  daily: "Hàng ngày",
  weekly: "Theo thứ",
};

export const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Date -> "YYYY-MM-DDTHH:mm" cho <input type="datetime-local"> (giờ máy). */
export function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
}

export function recurrenceText(j: {
  recurrence: Recurrence;
  recur_interval_minutes: number | null;
  recur_time: string | null;
  recur_days: number[] | null;
}): string {
  if (j.recurrence === "minutes") return `Mỗi ${j.recur_interval_minutes ?? "?"} phút`;
  if (j.recurrence === "daily") return `Hàng ngày ${(j.recur_time ?? "").slice(0, 5)}`;
  if (j.recurrence === "weekly")
    return `${(j.recur_days ?? []).map((d) => WEEKDAYS[d] ?? d).join(", ")} ${(j.recur_time ?? "").slice(0, 5)}`;
  return "Không lặp";
}
