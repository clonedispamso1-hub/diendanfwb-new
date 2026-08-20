/**
 * Runner Auto-Post ZERO-POLLING (chạy phía client, trong Admin Panel).
 *
 * Nguyên tắc:
 *  - Mỗi lần "thức dậy" chỉ fetch ĐÚNG 1 task đang chờ (limit 1, chỉ các cột cần).
 *  - Đăng bài xong → task chuyển sang trạng thái hoàn tất (`completed` ↔ `done` trong DB).
 *  - Tính mốc ngẫu nhiên kế tiếp rồi `setTimeout` → trong lúc chờ KHÔNG gọi API (0 request).
 *  - Nếu mốc kế tiếp rơi vào khung đêm (ngoài giờ hoạt động) → ngủ tới đúng giờ mở cửa
 *    hôm sau (mặc định 07:00) mới chạy tiếp.
 *
 * SQL bắt buộc: docs/sql/RUN_NOW_2026-08-20_AUTOPOST_RUNNER.sql
 */
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUTOPOST_CONFIG,
  clampToActiveWindow,
  fetchAutopostConfig,
  isWithinActiveWindow,
  randomGapMs,
  type AutopostConfig,
} from "@/lib/admin/autopost-config";

const sb = supabase as any;

/** Trạng thái hoàn tất: DB dùng 'done', UI hiển thị "completed". */
export const COMPLETED_STATUS = "done";

export type RunnerPhase = "stopped" | "working" | "idle" | "sleeping";

export interface RunnerState {
  phase: RunnerPhase;
  /** Mốc đăng bài kế tiếp (ms epoch) — null nếu không có task chờ. */
  nextAt: number | null;
  /** Số bài đã đăng trong phiên hiện tại. */
  posted: number;
  lastError: string | null;
  lastTaskAt: number | null;
  pending: number;
}

export interface PendingTaskLite {
  task_id: string;
  run_at: string;
}

const INITIAL: RunnerState = {
  phase: "stopped",
  nextAt: null,
  posted: 0,
  lastError: null,
  lastTaskAt: null,
  pending: 0,
};

let state: RunnerState = { ...INITIAL };
let timer: ReturnType<typeof setTimeout> | null = null;
let config: AutopostConfig = DEFAULT_AUTOPOST_CONFIG;
let busy = false;
const listeners = new Set<(s: RunnerState) => void>();

function emit(patch: Partial<RunnerState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function getRunnerState(): RunnerState {
  return state;
}

export function subscribeRunner(fn: (s: RunnerState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Fetch ĐÚNG 1 task đang chờ (chỉ id + run_at). */
export async function fetchNextPendingTask(): Promise<PendingTaskLite | null> {
  const { data, error } = await sb.rpc("admin_autopost_next_task", { p_limit: 1 });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.task_id) return null;
  return { task_id: row.task_id as string, run_at: row.run_at as string };
}

/** Đăng 1 task (server-side, an toàn) và đánh dấu hoàn tất. */
export async function execTask(taskId: string): Promise<void> {
  const { error } = await sb.rpc("admin_autopost_exec_task", { p_task: taskId });
  if (error) throw error;
}

/** Đẩy giờ chạy của 1 task sang mốc mới. */
async function rescheduleTask(taskId: string, at: Date): Promise<void> {
  const { error } = await sb.rpc("admin_autopost_reschedule", {
    p_task: taskId,
    p_run_at: at.toISOString(),
  });
  if (error) throw error;
}

/** Hẹn giờ thức dậy — trong lúc chờ runner NGHỈ HOÀN TOÀN (0 request). */
function sleepUntil(at: Date, phase: Exclude<RunnerPhase, "stopped" | "working">) {
  clearTimer();
  const delay = Math.max(at.getTime() - Date.now(), 1000);
  emit({ phase, nextAt: at.getTime() });
  timer = setTimeout(() => {
    void tick();
  }, Math.min(delay, 2 ** 31 - 1));
}

async function tick(): Promise<void> {
  if (busy || state.phase === "stopped") return;
  busy = true;
  try {
    const now = new Date();

    // Ngoài khung giờ hoạt động → ngủ tới giờ mở cửa kế tiếp.
    if (!isWithinActiveWindow(now, config)) {
      sleepUntil(clampToActiveWindow(now, config), "sleeping");
      return;
    }

    const task = await fetchNextPendingTask();
    if (!task) {
      // Không còn task chờ → nghỉ, kiểm tra lại ở nhịp giãn cách kế tiếp.
      emit({ pending: 0 });
      sleepUntil(clampToActiveWindow(new Date(Date.now() + randomGapMs(config)), config), "idle");
      return;
    }

    const runAt = new Date(task.run_at);
    if (runAt.getTime() > Date.now() + 1000) {
      // Task chưa tới giờ → ngủ đúng tới mốc đó (đã nằm trong khung hoạt động).
      sleepUntil(clampToActiveWindow(runAt, config), "idle");
      return;
    }

    emit({ phase: "working" });
    await execTask(task.task_id);
    emit({
      posted: state.posted + 1,
      lastTaskAt: Date.now(),
      lastError: null,
    });

    // Tính mốc ngẫu nhiên kế tiếp và đồng bộ vào DB cho task kế tiếp.
    const next = clampToActiveWindow(new Date(Date.now() + randomGapMs(config)), config);
    try {
      const upcoming = await fetchNextPendingTask();
      if (upcoming) await rescheduleTask(upcoming.task_id, next);
    } catch {
      /* best-effort: vẫn ngủ đúng lịch phía client */
    }
    sleepUntil(next, next.getTime() - Date.now() > 60 * 60 * 1000 ? "sleeping" : "idle");
  } catch (e: any) {
    emit({ lastError: e?.message || "Runner lỗi" });
    // Lỗi → lùi lại 1 nhịp giãn cách, không retry dồn dập.
    sleepUntil(clampToActiveWindow(new Date(Date.now() + randomGapMs(config)), config), "idle");
  } finally {
    busy = false;
  }
}

/** Khởi động runner (idempotent). */
export async function startRunner(cfg?: AutopostConfig): Promise<void> {
  config = cfg ?? (await fetchAutopostConfig(false));
  if (!config.enabled) {
    stopRunner();
    return;
  }
  clearTimer();
  emit({ phase: "idle", lastError: null });
  void tick();
}

/** Cập nhật cấu hình đang chạy (đặt lại lịch ngủ). */
export function updateRunnerConfig(cfg: AutopostConfig): void {
  config = cfg;
  if (state.phase === "stopped") return;
  clearTimer();
  void tick();
}

export function stopRunner(): void {
  clearTimer();
  emit({ phase: "stopped", nextAt: null });
}

export function isRunnerActive(): boolean {
  return state.phase !== "stopped";
}

export const RUNNER_PHASE_LABEL: Record<RunnerPhase, string> = {
  stopped: "Đã tắt",
  working: "Đang chạy",
  idle: "Đang nghỉ",
  sleeping: "Đang ngủ (ngoài khung giờ)",
};
