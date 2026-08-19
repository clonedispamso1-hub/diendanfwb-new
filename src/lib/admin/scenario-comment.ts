// Kịch Bản Bình Luận (V3) — bám theo Job của Kịch Bản Up Bài.
// Chỉ 2 chế độ nội dung: BOT COMMENT (text) hoặc GIF THƯỜNG (gif_library).
// Hàng đợi nằm trong PostgreSQL (pg_cron → scheduler_run_due()).
// SQL: docs/sql/RUN_NOW_2026-08-19_SCENARIO_COMMENT_V3.sql
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CommentJob = {
  job_id: string;
  title: string | null;
  scenario_name: string | null;
  weekday: number | null;
  status: string;
  run_at: string | null;
  clone_count: number;
  post_total: number;
  post_done: number;
  cmt_total: number;
  cmt_waiting: number;
  cmt_pending: number;
  cmt_done: number;
  cmt_failed: number;
  configured: boolean;
};

export type CommentTask = {
  task_id: string;
  post_task_id: string | null;
  slot_index: number;
  account_id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  gender: string | null;
  kind: "text" | "gif";
  content: string;
  delay_seconds: number;
  run_at: string | null;
  status: string;
  post_id: string | null;
  error: string | null;
  author_username: string | null;
  post_run_at: string | null;
  post_status: string | null;
};

export type CommentText = { id: string; content: string; created_at: string };
export type CommentSource = { bot_texts: number; gifs: number };


export async function commentJobs(limit = 30): Promise<CommentJob[]> {
  const { data, error } = await sb.rpc("admin_scenario_comment_jobs", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CommentJob[];
}

export async function commentTasks(jobId: string, limit = 500): Promise<CommentTask[]> {
  const { data, error } = await sb.rpc("admin_scenario_comment_tasks", {
    p_job: jobId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as CommentTask[];
}

export async function commentTextList(): Promise<CommentText[]> {
  const { data, error } = await sb.rpc("admin_comment_text_list");
  if (error) throw error;
  return (data ?? []) as CommentText[];
}

export async function commentTextAdd(items: string[]): Promise<number> {
  const { data, error } = await sb.rpc("admin_comment_text_add", { p_items: items });
  if (error) throw error;
  return (data ?? 0) as number;
}

export async function commentTextDelete(ids: string[]): Promise<number> {
  const { data, error } = await sb.rpc("admin_comment_text_delete", { p_ids: ids });
  if (error) throw error;
  return (data ?? 0) as number;
}

/** Số câu bot + số GIF thường đang có. */
export async function commentSources(): Promise<CommentSource> {
  const { data, error } = await sb.rpc("admin_comment_sources");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? { bot_texts: 0, gifs: 0 }) as CommentSource;
}

export type CommentApplyInput = {
  jobId: string;
  total: number;
  /** % comment dùng GIF thường; phần còn lại dùng BOT COMMENT. */
  pctGif?: number;
  delayMin?: number;
  delayMax?: number;
  accountMode?: "random" | "manual";
  accountIds?: string[];
};

/** Sinh ngay hàng đợi comment cho Job Up Bài. Trả về số comment đã tạo. */
export async function commentApply(input: CommentApplyInput): Promise<number> {
  const { data, error } = await sb.rpc("admin_scenario_comment_apply", {
    p_job: input.jobId,
    p_total: input.total,
    p_pct_gif: input.pctGif ?? 0,
    p_delay_min: input.delayMin ?? 2,
    p_delay_max: input.delayMax ?? 5,
    p_account_mode: input.accountMode ?? "random",
    p_account_ids: input.accountIds ?? [],
  });
  if (error) throw error;
  return (data ?? 0) as number;
}


export async function commentTaskDelete(taskId: string) {
  const { error } = await sb.rpc("admin_scenario_comment_task_delete", { p_task: taskId });
  if (error) throw error;
}

export async function commentClear(jobId: string): Promise<number> {
  const { data, error } = await sb.rpc("admin_scenario_comment_clear", { p_job: jobId });
  if (error) throw error;
  return (data ?? 0) as number;
}

/** Chạy / Tạm dừng / Hủy Job Up Bài — comment bám theo (CASCADE phía DB). */
export async function jobSetStatus(jobId: string, status: "pending" | "paused" | "cancelled") {
  const { error } = await sb.rpc("admin_scenario_run_set_status", {
    p_job: jobId,
    p_status: status,
  });
  if (error) throw error;
}

/* ------------------------------- Helpers -------------------------------- */

export const JOB_STATUS_LABEL: Record<string, string> = {
  pending: "Đang chờ",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Đã xong",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};

export const CMT_STATUS_LABEL: Record<string, string> = {
  waiting: "Đang chờ",
  pending: "Đang chờ",
  running: "Đang chạy",
  done: "Đã chạy",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};

export const KIND_LABEL: Record<string, string> = {
  text: "Bot comment",
  gif: "GIF thường",
};


export function gifUrlOf(content: string): string | null {
  const m = /^\[\[gif:(.+)\]\]$/.exec(content?.trim() ?? "");
  return m ? m[1] : null;
}
