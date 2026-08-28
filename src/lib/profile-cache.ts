/**
 * profile-cache — cache hồ sơ (bảng `profiles` trên Supabase 1) dùng chung
 * cho Feed / Bình luận / Thông báo / Video.
 *
 * Mục tiêu: giảm Egress Supabase 1 tối đa.
 *  1. Gộp: N user id → ĐÚNG 1 request `in('id', ids)`.
 *  2. TTL 5 phút + lưu sessionStorage → F5 / đổi trang KHÔNG tải lại avatar+tên.
 *  3. In-flight dedupe: nhiều component gọi cùng lúc chỉ tạo 1 request.
 *  4. Chỉ select đúng các cột UI cần (không bao giờ `select('*')`).
 */
import { supabase as defaultClient } from "@/lib/supabase";

export const PROFILE_CACHE_TTL = 5 * 60_000;

/** Cột tối thiểu để render 1 tác giả (tên + avatar + badge). */
export const PROFILE_UI_COLS =
  "id, display_name, full_name, username, avatar, is_admin, vip_level, badge_id, is_banned";

/** Cột cho khung chi tiết bài viết / bình luận (thêm gender + gif danh hiệu). */
export const PROFILE_COMMENT_COLS =
  "id, display_name, full_name, username, avatar, vip_level, title_gif_url, is_admin, role, gender, is_banned";

/** Cột cho header bài viết chi tiết (thêm vị trí). */
export const PROFILE_POST_COLS =
  "id, display_name, full_name, username, avatar, vip_level, title_gif_url, location, province, is_banned";

/** Lấy 1 hồ sơ qua cache (gộp chung in-flight với batch khác). */
export async function fetchProfileById(
  id: string | null | undefined,
  cols: string = PROFILE_UI_COLS,
  client: any = defaultClient,
): Promise<Row | null> {
  if (!id) return null;
  const map = await fetchProfilesByIds([id], cols, client);
  return map.get(id) ?? null;
}

type Row = Record<string, any>;
type Entry = { at: number; value: Row };

const SS_KEY = "pcache:v1";
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<Row | null>>();

let hydrated = false;
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v && now - v.at < PROFILE_CACHE_TTL) mem.set(k, v);
    }
  } catch { /* ignore */ }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (typeof window === "undefined") return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      const obj: Record<string, Entry> = {};
      for (const [k, v] of mem) if (now - v.at < PROFILE_CACHE_TTL) obj[k] = v;
      sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
    } catch { /* quota — bỏ qua */ }
  }, 400);
}

function cacheKey(id: string, cols: string) {
  return `${cols}|${id}`;
}

export function peekProfile(id: string, cols = PROFILE_UI_COLS): Row | null {
  hydrate();
  const hit = mem.get(cacheKey(id, cols));
  if (hit && Date.now() - hit.at < PROFILE_CACHE_TTL) return hit.value;
  return null;
}

export function putProfile(row: Row, cols = PROFILE_UI_COLS) {
  if (!row?.id) return;
  mem.set(cacheKey(row.id, cols), { at: Date.now(), value: row });
  persist();
}

/**
 * Cập nhật NGAY các field vừa lưu vào mọi entry cache của user (không xoá cache
 * → không tạo request mới), rồi phát event để Header / Feed / Profile vẽ lại.
 * Dùng sau khi update `profiles` thành công (tên, tiểu sử, avatar).
 */
export function patchProfileCache(id: string, patch: Row) {
  if (!id || !patch) return;
  hydrate();
  for (const [k, entry] of [...mem.entries()]) {
    if (!k.endsWith(`|${id}`)) continue;
    mem.set(k, { at: entry.at, value: { ...entry.value, ...patch } });
  }
  persist();
}

/** Phát event đồng bộ UI sau khi hồ sơ đổi (tên / tiểu sử / avatar). */
export function emitProfileUpdated(userId: string, patch: Row) {
  if (!userId) return;
  try {
    window.dispatchEvent(
      new CustomEvent("app:profile-updated", { detail: { userId, patch } }),
    );
  } catch {
    /* SSR / môi trường không có window */
  }
}

export function invalidateProfile(id?: string) {
  if (!id) {
    mem.clear();
  } else {
    for (const k of [...mem.keys()]) if (k.endsWith(`|${id}`)) mem.delete(k);
  }
  persist();
}

/**
 * Một số DB (bản cũ / project khác) thiếu vài cột tuỳ chọn như
 * `identity_crown`, `badge_id`... PostgREST trả 42703 và TOÀN BỘ query hỏng →
 * feed mất tên + avatar (hiển thị "Thành viên"). Ở đây ta tự bỏ cột thiếu rồi
 * thử lại, và nhớ danh sách cột lỗi để lần sau không hỏi nữa.
 */
const droppedCols = new Set<string>();

function stripCols(cols: string): string {
  return cols
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && !droppedCols.has(c))
    .join(", ");
}

async function selectProfilesResilient(
  client: any,
  cols: string,
  ids: string[],
): Promise<{ data: Row[] | null }> {
  let current = stripCols(cols) || "id";
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await client.from("profiles").select(current).in("id", ids);
    if (!res.error) return { data: (res.data as Row[]) || [] };
    const missing = /column\s+\w*\.?"?([a-z0-9_]+)"?\s+does not exist/i.exec(
      String(res.error?.message || ""),
    )?.[1];
    if (!missing) {
      console.warn("[profile-cache] profiles select failed:", res.error?.message);
      return { data: null };
    }
    droppedCols.add(missing);
    const next = stripCols(current);
    if (next === current) return { data: null };
    current = next || "id";
  }
  return { data: null };
}

/**
 * Lấy map hồ sơ theo danh sách id — chỉ request các id chưa có trong cache.
 */

export async function fetchProfilesByIds(
  ids: Array<string | null | undefined>,
  cols: string = PROFILE_UI_COLS,
  client: any = defaultClient,
): Promise<Map<string, Row>> {
  hydrate();
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, Row>();
  const missing: string[] = [];

  for (const id of unique) {
    const hit = peekProfile(id, cols);
    if (hit) map.set(id, hit);
    else missing.push(id);
  }

  // Chờ các request đang bay cho cùng id (dedupe) trước khi tự fetch.
  const stillMissing: string[] = [];
  await Promise.all(
    missing.map(async (id) => {
      const running = inflight.get(cacheKey(id, cols));
      if (!running) return void stillMissing.push(id);
      const row = await running.catch(() => null);
      if (row) map.set(id, row);
      else stillMissing.push(id);
    }),
  );

  if (stillMissing.length > 0) {
    let resolveAll: (rows: Map<string, Row>) => void = () => {};
    const shared = new Promise<Map<string, Row>>((r) => { resolveAll = r; });
    for (const id of stillMissing) {
      inflight.set(
        cacheKey(id, cols),
        shared.then((m) => m.get(id) ?? null),
      );
    }
    const result = new Map<string, Row>();
    try {
      const { data } = await selectProfilesResilient(client, cols, stillMissing);
      for (const row of ((data as Row[]) || [])) {
        if (!row?.id) continue;
        putProfile(row, cols);
        result.set(row.id, row);
        map.set(row.id, row);
      }
    } finally {
      resolveAll(result);
      for (const id of stillMissing) inflight.delete(cacheKey(id, cols));
    }
  }

  return map;
}

/** Gắn `profiles` vào danh sách row có `user_id`. */
export async function attachProfiles<T extends { user_id?: string | null }>(
  rows: T[],
  cols: string = PROFILE_UI_COLS,
  client: any = defaultClient,
): Promise<Array<T & { profiles: Row | null }>> {
  if (rows.length === 0) return rows as Array<T & { profiles: Row | null }>;
  const map = await fetchProfilesByIds(rows.map((r) => r.user_id), cols, client);
  return rows.map((r) => ({ ...r, profiles: (r.user_id && map.get(r.user_id)) || null }));
}
