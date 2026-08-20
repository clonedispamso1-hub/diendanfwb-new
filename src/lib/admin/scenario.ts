// Kịch Bản Up Bài (V2) — toàn bộ chạy phía server.
// pg_cron gọi public.scheduler_run_due() mỗi phút → đóng web / refresh vẫn chạy.
// SQL: docs/sql/RUN_NOW_2026-08-19_SCENARIO_POST_V2.sql
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUTOPOST_CONFIG,
  clampToActiveWindow,
  randomGapMs,
  type AutopostConfig,
} from "@/lib/admin/autopost-config";

const sb = supabase as any;

export type Scenario = {
  id: string;
  name: string;
  description: string | null;
  caption: string | null;
  image_urls: string[] | null;
  gif_url: string | null;
  vip_gif_url: string | null;
  voice_token: string | null;
  created_at: string;
};

export type ScenarioDay = {
  weekday: number; // 0=CN .. 6=T7
  clone_count: number;
  scenario_id: string | null;
  scenario_name: string | null;
};

export type CloneLite = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  gender: string | null;
  uid: string | null;
};

export type ScenarioRun = {
  job_id: string;
  title: string | null;
  status: string;
  weekday: number | null;
  run_at: string;
  total: number;
  pending_count: number;
  done_count: number;
  failed_count: number;
};

export type ScenarioTask = {
  task_id: string;
  account_id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  gender: string | null;
  run_at: string;
  status: string;
  content: string | null;
  image_urls: string[] | null;
  gif_url: string | null;
  vip_gif_url: string | null;
  voice_token: string | null;
  post_id: string | null;
  error: string | null;
};

/* ------------------------------ Kịch bản ------------------------------ */

export async function scenarioList(): Promise<Scenario[]> {
  const { data, error } = await sb.rpc("admin_scenario_post_list");
  if (error) throw error;
  return (data ?? []) as Scenario[];
}

export async function scenarioSave(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  caption?: string | null;
  imageUrls?: string[];
  gifUrl?: string | null;
  vipGifUrl?: string | null;
  voiceToken?: string | null;
}): Promise<string> {
  const { data, error } = await sb.rpc("admin_scenario_post_save", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_caption: input.caption ?? null,
    p_image_urls: input.imageUrls ?? [],
    p_gif_url: input.gifUrl ?? null,
    p_vip_gif_url: input.vipGifUrl ?? null,
    p_voice_token: input.voiceToken ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function scenarioDeleteMany(ids: string[]): Promise<number> {
  const { data, error } = await sb.rpc("admin_scenario_post_delete_many", { p_ids: ids });
  if (error) throw error;
  return (data ?? 0) as number;
}

/* --------------------------- Cấu hình theo thứ -------------------------- */

export async function scenarioDays(): Promise<ScenarioDay[]> {
  const { data, error } = await sb.rpc("admin_scenario_post_days");
  if (error) throw error;
  return (data ?? []) as ScenarioDay[];
}

export async function scenarioDaySetScenario(weekday: number, scenarioId: string | null) {
  const { error } = await sb.rpc("admin_scenario_post_day_set", {
    p_weekday: weekday,
    p_scenario: scenarioId,
  });
  if (error) throw error;
}

/* -------------------------------- Clone -------------------------------- */

export async function scenarioClones(gender?: "male" | "female"): Promise<CloneLite[]> {
  const { data, error } = await sb.rpc("admin_scenario_clones", { p_gender: gender ?? null });
  if (error) throw error;
  return (data ?? []) as CloneLite[];
}

export async function scenarioRandomClones(female: number, male: number): Promise<string[]> {
  const { data, error } = await sb.rpc("admin_scenario_clone_random", {
    p_female: female,
    p_male: male,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

/* -------------------------------- Chạy --------------------------------- */

export async function scenarioRun(
  weekday: number,
  scenarioId: string,
  accountIds: string[],
  startAt?: string,
): Promise<string> {
  const { data, error } = await sb.rpc("admin_scenario_post_run", {
    p_weekday: weekday,
    p_scenario: scenarioId,
    p_account_ids: accountIds,
    p_start: startAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return data as string;
}

/* --------------------- Lịch giãn cách ngẫu nhiên (V3) -------------------- */

/**
 * Lập lịch cho n bài: mỗi bài cách bài trước 1 khoảng NGẪU NHIÊN
 * trong [gapMin, gapMax] phút (mặc định 15–30).
 *
 * Mốc nào rơi ra ngoài khung giờ hoạt động (vd sau 23:00) sẽ tự động được
 * đẩy sang đúng giờ mở cửa hôm sau (vd 07:00), rồi tiếp tục giãn cách.
 */
export function buildSchedule(
  start: Date,
  n: number,
  cfg: AutopostConfig = DEFAULT_AUTOPOST_CONFIG,
): Date[] {
  if (n <= 0) return [];
  const out: Date[] = [];
  let cursor = clampToActiveWindow(start, cfg);
  for (let i = 0; i < n; i++) {
    out.push(new Date(cursor));
    cursor = clampToActiveWindow(new Date(cursor.getTime() + randomGapMs(cfg)), cfg);
  }
  return out;
}

export async function scenarioRuns(limit = 20): Promise<ScenarioRun[]> {
  const { data, error } = await sb.rpc("admin_scenario_runs", { p_kind: "post", p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ScenarioRun[];
}

export async function scenarioTasks(jobId: string): Promise<ScenarioTask[]> {
  const { data, error } = await sb.rpc("admin_scenario_tasks", { p_job: jobId });
  if (error) throw error;
  return (data ?? []) as ScenarioTask[];
}

export async function scenarioTaskUpdate(input: {
  taskId: string;
  content?: string | null;
  imageUrls?: string[] | null;
  gifUrl?: string | null;
  vipGifUrl?: string | null;
  voiceToken?: string | null;
  runAt?: string | null;
}) {
  const { error } = await sb.rpc("admin_scenario_task_update", {
    p_task: input.taskId,
    p_content: input.content ?? null,
    p_image_urls: input.imageUrls ?? null,
    p_gif_url: input.gifUrl ?? null,
    p_vip_gif_url: input.vipGifUrl ?? null,
    p_voice_token: input.voiceToken ?? null,
    p_run_at: input.runAt ?? null,
  });
  if (error) throw error;
}

export async function scenarioTaskDelete(taskId: string) {
  const { error } = await sb.rpc("admin_scenario_task_delete", { p_task: taskId });
  if (error) throw error;
}

export async function scenarioRunDelete(jobId: string) {
  const { error } = await sb.rpc("admin_scenario_run_delete", { p_job: jobId });
  if (error) throw error;
}

export async function scenarioPurgePending(): Promise<number> {
  const { data, error } = await sb.rpc("admin_scenario_purge_pending");
  if (error) throw error;
  return (data ?? 0) as number;
}

/* ------------------------------- Helpers -------------------------------- */

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5",
  5: "Thứ 6", 6: "Thứ 7", 0: "Chủ Nhật",
};

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Số clone mặc định theo thứ (đồng bộ với DB, không sửa được). */
export const WEEKDAY_QUOTA: Record<number, number> = {
  1: 20, 2: 30, 3: 40, 4: 45, 5: 58, 6: 64, 0: 78,
};

export function todayWeekday(): number {
  return new Date().getDay();
}

export function todayLabel(): string {
  return `Hôm nay: ${WEEKDAY_LABEL[todayWeekday()]}`;
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Đang chờ",
  running: "Đang chạy",
  done: "Đã chạy xong",
  failed: "Lỗi",
};
