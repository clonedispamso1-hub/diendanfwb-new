/**
 * Tym mô phỏng — cấu hình CHỈ Admin ghi được.
 *
 * Lưu ở `admin_site_settings.key = 'sim_likes_config'` (RLS: chỉ admin insert/update):
 *   Đang chạy:  { [postId]: { a: authorId, t: target, m: minutes, s: startMs } }
 *   Đã chốt:    { [postId]: { a: authorId, f: finalCount } }   (đã xoá t/m/s, không tính nữa)
 * Dọn dẹp: tự chốt khi Admin đăng bài mới (không thêm request) + nút "Dọn cấu hình" (chỉ khi bấm).
 * Không còn token trong nội dung bài → user thường không thể tự tạo cấu hình.
 * Tab Đăng bài của "Tài khoản thứ hai" (Admin Panel) là nơi duy nhất ghi config.
 *
 * Trình duyệt chỉ tính khi render theo đường cong 2 giai đoạn (xem simLikeProgress).
 * Không timer, không bảng likes, đọc qua site-settings-cache (đã gộp + cache).
 */
import { adminSetSiteSetting } from "@/lib/admin-db";
import { getSiteSetting, invalidateSiteSettings, peekSiteSetting } from "@/lib/site-settings-cache";

/** Số tym mục tiêu do Admin nhập tự do — hợp lệ trong khoảng 1..100.000. */
export const SIM_TARGET_MIN = 1;
export const SIM_TARGET_MAX = 100_000;
export const isValidSimTarget = (n: number): boolean =>
  Number.isInteger(n) && n >= SIM_TARGET_MIN && n <= SIM_TARGET_MAX;
export const SIM_DURATIONS = [
  { minutes: 60, label: "1 giờ" },
  { minutes: 180, label: "3 giờ" },
  { minutes: 1440, label: "24 giờ" },
] as const;

export const SIM_LIKES_KEY = "sim_likes_config";

export type SimLikeCfg = { target: number; minutes: number; start: number };
type Entry = { a: string; t: number; m: number; s: number };
type FinalEntry = { a: string; f: number };
type Store = Record<string, Entry | FinalEntry>;

function validFinal(e: any): e is FinalEntry {
  return e && typeof e.a === "string" && isValidSimTarget(Number(e.f)) && !("t" in e);
}

function valid(e: any): e is Entry {
  return (
    e && typeof e.a === "string" &&
    isValidSimTarget(Number(e.t)) &&
    SIM_DURATIONS.some((d) => d.minutes === Number(e.m)) &&
    Number.isFinite(Number(e.s)) && Number(e.s) > 0
  );
}

let loading = false;
/** Đồng bộ: trả store nếu đã có trong cache; nếu chưa thì nạp 1 lần (gộp request). */
function peekStore(): Store | undefined {
  const v = peekSiteSetting<Store>(SIM_LIKES_KEY);
  if (v === undefined && !loading) {
    loading = true;
    void getSiteSetting(SIM_LIKES_KEY).finally(() => { loading = false; });
  }
  return v && typeof v === "object" ? v : undefined;
}

export function loadSimLikeStore(): Promise<Store> {
  return getSiteSetting<Store>(SIM_LIKES_KEY).then((v) => (v && typeof v === "object" ? v : {}));
}

/** Config hợp lệ của bài — phải khớp đúng tác giả admin đã chọn. */
export function getSimLikeCfg(postId: string, authorId: string, store = peekStore()): SimLikeCfg | null {
  const e = store?.[postId];
  if (!valid(e) || e.a !== authorId) return null;
  return { target: Number(e.t), minutes: Number(e.m), start: Number(e.s) };
}

/** Giai đoạn 1 kéo dài 20 phút, kết thúc ở đúng 10% mục tiêu. */
export const SIM_PHASE1_MS = 20 * 60_000;
export const SIM_PHASE1_RATIO = 0.1;

/**
 * Tỉ lệ tiến độ (0..1) theo đường cong, không tuyến tính:
 *  - GĐ1 (0–20'): ease-out 1-(1-p)^1.5 → 0 → 10% (5' ≈ 3.5%).
 *  - GĐ2 (20'–hết): ease-out 1-(1-u)^1.4 → 10% → 100%: đầu nhanh, giữa vừa, cuối chậm.
 * VD 1000/1h: 5'≈35, 20'=100, 40'≈659, 60'=1000.
 */
export function simLikeProgress(elapsedMs: number, durationMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= durationMs) return 1;
  const p1 = Math.min(SIM_PHASE1_MS, durationMs);
  if (elapsedMs <= p1) {
    const p = elapsedMs / p1;
    return SIM_PHASE1_RATIO * (1 - Math.pow(1 - p, 1.5));
  }
  const u = (elapsedMs - p1) / (durationMs - p1);
  return SIM_PHASE1_RATIO + (1 - SIM_PHASE1_RATIO) * (1 - Math.pow(1 - u, 1.4));
}

/** Chỉ tính khi render — không timer, không ghi DB. */
export function simLikeNow(cfg: SimLikeCfg, now = Date.now()): number {
  const elapsed = Math.max(0, now - cfg.start);
  const duration = cfg.minutes * 60_000;
  return Math.min(cfg.target, Math.round(cfg.target * simLikeProgress(elapsed, duration)));
}

/** Số tym mô phỏng hiển thị của bài (đang chạy → công thức; đã chốt → số cuối). */
export function simLikeForPost(
  postId: string, authorId: string, createdAtMs: number | null, store: Store | undefined, now = Date.now(),
): number {
  const e = store?.[postId];
  if (!e || e.a !== authorId) return 0;
  if (validFinal(e)) return e.f;
  const cfg = getSimLikeCfg(postId, authorId, store);
  if (!cfg) return 0;
  const start = createdAtMs != null && Number.isFinite(createdAtMs) ? Math.max(cfg.start, createdAtMs) : cfg.start;
  return simLikeNow({ ...cfg, start }, now);
}

function isDone(e: Entry, now: number) {
  return now >= Number(e.s) + Number(e.m) * 60_000;
}

/** Chốt các bài đã chạy xong: giữ số cuối, bỏ target/start/minutes. Thuần, không gọi DB. */
function compactFinished(store: Store, now: number): number {
  let n = 0;
  for (const [id, e] of Object.entries(store)) {
    if (valid(e) && isDone(e, now)) { store[id] = { a: e.a, f: Number(e.t) }; n++; }
  }
  return n;
}

export type SimCleanupScan = {
  completed: string[];   // đã đạt mục tiêu / hết thời gian → chốt số cuối
  deleted: string[];     // bài không còn / đã xoá → xoá hẳn
  invalid: string[];     // cấu hình lỗi → xoá hẳn
  running: number;
  finalized: number;
  checkedPosts: boolean; // false nếu không kiểm tra được bài (khi đó không xoá theo "bài đã xoá")
};

/** Chỉ chạy khi Admin bấm. Đọc 1 setting + kiểm tra bài theo lô 200 id. */
export async function scanSimLikeStore(
  fetchPostStates: (ids: string[]) => Promise<Map<string, { deleted: boolean }>>,
): Promise<SimCleanupScan> {
  invalidateSiteSettings(SIM_LIKES_KEY);
  const store = await loadSimLikeStore();
  const now = Date.now();
  const r: SimCleanupScan = { completed: [], deleted: [], invalid: [], running: 0, finalized: 0, checkedPosts: true };
  const ok: string[] = [];
  for (const [id, e] of Object.entries(store)) {
    if (valid(e) || validFinal(e)) ok.push(id); else r.invalid.push(id);
  }
  let states: Map<string, { deleted: boolean }> | null = null;
  try { states = await fetchPostStates(ok); } catch { r.checkedPosts = false; }
  for (const id of ok) {
    const e = store[id];
    if (states && (!states.has(id) || states.get(id)!.deleted)) { r.deleted.push(id); continue; }
    if (validFinal(e)) r.finalized++;
    else if (isDone(e as Entry, now)) r.completed.push(id);
    else r.running++;
  }
  return r;
}

/** Áp dụng kết quả quét. Đọc lại store mới nhất để không mất bài vừa đăng. 1 lần ghi. */
export async function applySimLikeCleanup(scan: SimCleanupScan): Promise<number> {
  invalidateSiteSettings(SIM_LIKES_KEY);
  const store = { ...(await loadSimLikeStore()) };
  let n = 0;
  for (const id of [...scan.deleted, ...scan.invalid]) if (id in store) { delete store[id]; n++; }
  n += compactFinished(store, Date.now());
  if (n > 0) await adminSetSiteSetting(SIM_LIKES_KEY, store);
  invalidateSiteSettings(SIM_LIKES_KEY);
  return n;
}

/** Chỉ gọi từ Admin Panel. RLS của admin_site_settings chặn mọi user không phải admin. */
export async function saveSimLikeForPost(postId: string, authorId: string, target: number, minutes: number): Promise<void> {
  if (!isValidSimTarget(target)) throw new Error(`Số tym mục tiêu không hợp lệ ( ${SIM_TARGET_MIN}–${SIM_TARGET_MAX} ).`);
  if (!SIM_DURATIONS.some((d) => d.minutes === minutes)) throw new Error("Thời gian tăng không hợp lệ.");
  invalidateSiteSettings(SIM_LIKES_KEY);
  const store = { ...(await loadSimLikeStore()) };
  // Kiểm tra nhẹ lúc đăng bài: chốt các bài đã chạy xong ngay trong lần ghi này (không thêm request).
  compactFinished(store, Date.now());
  store[postId] = { a: authorId, t: target, m: minutes, s: Date.now() };
  await adminSetSiteSetting(SIM_LIKES_KEY, store);
  invalidateSiteSettings(SIM_LIKES_KEY);
}
