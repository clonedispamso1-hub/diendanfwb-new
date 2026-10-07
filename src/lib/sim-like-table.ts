/**
 * Tym mô phỏng — bảng riêng `simulated_post_likes` (Supabase #1), 1 dòng / bài.
 *
 * Đọc: chỉ các bài đang hiển thị, gộp theo lô 250ms (≤200 id / request), cache cả phiên.
 *   Cấu hình không đổi sau khi tạo → dòng có cấu hình cache vĩnh viễn trong phiên;
 *   bài không có tym mô phỏng cache 10 phút (để bài mới tạo vẫn hiện tym).
 * Ghi: chỉ Admin (RLS is_admin). Không timer, không realtime, không cron, không bảng likes.
 *
 * FALLBACK (thời gian test): nếu bảng chưa tồn tại → dùng cấu hình cũ trong
 * admin_site_settings (sim-like-token.ts). Xoá fallback sau khi test ổn.
 */
import { supabase } from "@/lib/db/router";
import { adminDb } from "@/lib/admin-db";
import { SIM_TARGETS, SIM_DURATIONS, simLikeNow, saveSimLikeForPost } from "@/lib/sim-like-token";

export const SIM_TABLE = "simulated_post_likes";
const COLS = "post_id, author_id, target, duration_minutes, started_at, final_count";
const NULL_TTL = 10 * 60_000;
/** Bài mới (< 5 phút): cấu hình có thể được Admin lưu ngay sau khi bài xuất hiện → chỉ cache "không có" 30s. */
const NEW_POST_MS = 5 * 60_000;
const NEW_NULL_TTL = 30_000;
/** Bảng thiếu → thử lại sau 2 phút (không kẹt fallback cả phiên khi bảng vừa được tạo). */
const MISSING_RETRY = 2 * 60_000;
let missingAt = 0;
const SS_KEY = "simlikes:v1";
const SS_MAX = 2000;

export type SimRow = {
  post_id: string; author_id: string; target: number;
  duration_minutes: number; started_at: string; final_count: number | null;
};
type Hit = { at: number; row: SimRow | null; ttl?: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null = chưa biết; true = bảng thiếu → dùng fallback cũ. */
let tableMissing: boolean | null = null;
export const simTableMissing = () => tableMissing === true && Date.now() - missingAt < MISSING_RETRY;

export function isMissingTableError(err: any): boolean {
  const s = `${err?.code ?? ""} ${err?.message ?? ""}`;
  return /42P01|PGRST205|PGRST204|does not exist|schema cache|simulated_post_likes/i.test(s);
}

const cache = new Map<string, Hit>();
let hydrated = false;
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, SimRow>)) cache.set(k, { at: Date.now(), row: v });
  } catch { /* ignore */ }
}
function persist() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, SimRow> = {};
    let n = 0;
    for (const [k, v] of cache) { if (v.row && n++ < SS_MAX) obj[k] = v.row; }
    sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}
function fresh(id: string): Hit | undefined {
  const h = cache.get(id);
  if (!h) return undefined;
  if (h.row === null && Date.now() - h.at > (h.ttl ?? NULL_TTL)) return undefined;
  return h;
}

let queue = new Map<string, Array<(r: SimRow | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue; queue = new Map(); timer = null;
  const ids = [...batch.keys()];
  const found = new Map<string, SimRow>();
  let ok = true;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase as any).from(SIM_TABLE).select(COLS).in("post_id", ids.slice(i, i + 200));
    if (error) {
      ok = false;
      if (isMissingTableError(error)) { tableMissing = true; missingAt = Date.now(); }
      break;
    }
    tableMissing = false;
    for (const r of (data ?? []) as SimRow[]) found.set(String(r.post_id), r);
  }
  const at = Date.now();
  for (const [id, fns] of batch) {
    const row = found.get(id) ?? null;
    if (ok) cache.set(id, { at, row, ttl: row ? undefined : (newPosts.has(id) ? NEW_NULL_TTL : NULL_TTL) });
    fns.forEach((fn) => fn(row));
  }
  if (ok) persist();
}

/** Lấy cấu hình tym mô phỏng của 1 bài (gộp lô với các bài khác đang mount). */
const newPosts = new Set<string>();
export function getSimRow(postId: string, createdAtMs?: number | null): Promise<SimRow | null> {
  hydrate();
  if (!UUID_RE.test(postId) || simTableMissing()) return Promise.resolve(null);
  if (createdAtMs != null && Date.now() - createdAtMs < NEW_POST_MS) newPosts.add(postId);
  const h = fresh(postId);
  if (h) return Promise.resolve(h.row);
  return new Promise((resolve) => {
    const list = queue.get(postId) ?? [];
    list.push(resolve);
    queue.set(postId, list);
    if (!timer) timer = setTimeout(() => { void flush(); }, 250);
  });
}

export function peekSimRow(postId: string): SimRow | null | undefined {
  hydrate();
  return fresh(postId)?.row;
}

/** Số tym mô phỏng hiển thị — chỉ khi đúng tác giả admin đã chọn. */
export function simLikesFromRow(row: SimRow | null | undefined, authorId: string, createdAtMs: number | null, now = Date.now()): number {
  if (!row || String(row.author_id) !== authorId) return 0;
  if (!(SIM_TARGETS as readonly number[]).includes(Number(row.target))) return 0;
  if (row.final_count != null) return Math.max(0, Math.min(5000, Number(row.final_count)));
  if (!SIM_DURATIONS.some((d) => d.minutes === Number(row.duration_minutes))) return 0;
  const s = Date.parse(row.started_at);
  if (!Number.isFinite(s)) return 0;
  const start = createdAtMs != null && Number.isFinite(createdAtMs) ? Math.max(s, createdAtMs) : s;
  return simLikeNow({ target: Number(row.target), minutes: Number(row.duration_minutes), start }, now);
}

/* ---------------------------- Ghi (Admin) ---------------------------- */

/** Chốt các bài đã chạy xong: final_count = target. 1 câu UPDATE, chỉ khi Admin gọi. */
export async function finalizeDoneSimRows(): Promise<number> {
  const db = (await adminDb()) as any;
  const { data, error } = await db.from(SIM_TABLE).select("post_id, target")
    .is("final_count", null).lt("ends_at", new Date().toISOString()).limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ post_id: string; target: number }>;
  // Gom theo target → tối đa 5 câu UPDATE.
  const byTarget = new Map<number, string[]>();
  for (const r of rows) byTarget.set(r.target, [...(byTarget.get(r.target) ?? []), r.post_id]);
  for (const [t, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e } = await db.from(SIM_TABLE).update({ final_count: t }).in("post_id", ids.slice(i, i + 200));
      if (e) throw e;
    }
  }
  return rows.length;
}

/** Tạo cấu hình cho bài mới. Trả false nếu bảng chưa có (để gọi fallback cũ). */
export async function insertSimRow(postId: string, authorId: string, target: number, minutes: number): Promise<boolean> {
  const db = (await adminDb()) as any;
  const start = new Date();
  const { error } = await db.from(SIM_TABLE).insert([{
    post_id: postId, author_id: authorId, target, duration_minutes: minutes,
    started_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
  }]);
  if (error) {
    if (isMissingTableError(error)) { tableMissing = true; missingAt = Date.now(); return false; }
    throw error;
  }
  tableMissing = false;
  cache.delete(postId);
  // Kiểm tra nhẹ: chốt bài đã xong (không ảnh hưởng nếu lỗi).
  try { await finalizeDoneSimRows(); } catch { /* best-effort */ }
  return true;
}

/* ---------------------------- Dọn (Admin bấm) ---------------------------- */

export type SimTableScan = {
  completed: number;
  deleted: string[];
  invalid: number;
  running: number;
  finalized: number;
  checkedPosts: boolean;
};

/** Quét bảng (phân trang 1000) + kiểm tra bài trên #3. Chỉ khi Admin bấm. */
export async function scanSimTable(
  fetchPostStates: (ids: string[]) => Promise<Map<string, { deleted: boolean }>>,
): Promise<SimTableScan | null> {
  const db = (await adminDb()) as any;
  const rows: Array<{ post_id: string; final_count: number | null; ends_at: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(SIM_TABLE).select("post_id, final_count, ends_at").range(from, from + 999);
    if (error) { if (isMissingTableError(error)) { tableMissing = true; missingAt = Date.now(); return null; } throw error; }
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const r: SimTableScan = { completed: 0, deleted: [], invalid: 0, running: 0, finalized: 0, checkedPosts: true };
  let states: Map<string, { deleted: boolean }> | null = null;
  try { states = await fetchPostStates(rows.map((x) => x.post_id)); } catch { r.checkedPosts = false; }
  const now = Date.now();
  for (const x of rows) {
    if (states && (!states.has(x.post_id) || states.get(x.post_id)!.deleted)) { r.deleted.push(x.post_id); continue; }
    if (x.final_count != null) r.finalized++;
    else if (Date.parse(x.ends_at) <= now) r.completed++;
    else r.running++;
  }
  return r;
}

/** Xoá cấu hình của bài đã xoá + chốt bài đã xong. Không đụng posts/likes. */
export async function applySimTableCleanup(scan: SimTableScan): Promise<number> {
  const db = (await adminDb()) as any;
  let n = 0;
  for (let i = 0; i < scan.deleted.length; i += 200) {
    const ids = scan.deleted.slice(i, i + 200);
    const { error } = await db.from(SIM_TABLE).delete().in("post_id", ids);
    if (error) throw error;
    n += ids.length;
  }
  n += await finalizeDoneSimRows();
  cache.clear(); persist();
  return n;
}

/** Điểm ghi duy nhất cho Admin Panel: bảng mới; bảng chưa có → cấu hình cũ (fallback). */
export async function saveSimLike(postId: string, authorId: string, target: number, minutes: number): Promise<"table" | "legacy"> {
  if (await insertSimRow(postId, authorId, target, minutes)) return "table";
  await saveSimLikeForPost(postId, authorId, target, minutes);
  return "legacy";
}
