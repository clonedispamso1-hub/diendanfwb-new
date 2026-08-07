/**
 * HỆ THỐNG 2 — "Media VIP gắn sau tên" (Admin Panel / Clone).
 *
 * Dữ liệu: profiles.vip_media  (jsonb, mảng URL Cloudinary — không giới hạn số lượng)
 * Fallback: profiles.title_gif_url (bản cũ, chỉ 1 GIF) khi cột vip_media chưa có.
 *
 * TUYỆT ĐỐI KHÔNG đọc / ghi bảng gif_library (Kho GIF dùng chung).
 * Không dùng chung state, query hay component với Kho GIF.
 */
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export const VIP_MEMBER_TITLE = "⭐ Thành viên VIP";
/** Thời hạn tham gia nhóm VIP — random mỗi lần mở popup, không lưu database. */
export const VIP_DURATIONS = ["8 tháng", "12 tháng", "24 tháng", "Vĩnh viễn"] as const;

export function randomVipDuration(): string {
  return VIP_DURATIONS[Math.floor(Math.random() * VIP_DURATIONS.length)];
}

function missingColumn(msg?: string | null) {
  const m = (msg || "").toLowerCase();
  return m.includes("vip_media") || m.includes("column") || m.includes("schema cache");
}

function normalize(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && !!v);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        return normalize(JSON.parse(s));
      } catch {
        return [];
      }
    }
    return [s];
  }
  return [];
}

/* ------------------------------- cache ------------------------------- */

const cache = new Map<string, string[]>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: number | null = null;

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeCloneVipMedia(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCachedCloneVipMedia(userId: string): string[] | undefined {
  return cache.get(userId);
}

async function flush() {
  timer = null;
  const ids = Array.from(pending);
  pending.clear();
  if (!ids.length) return;
  let res = await sb.from("profiles").select("id, vip_media, title_gif_url").in("id", ids);
  if (res.error && missingColumn(res.error.message)) {
    res = await sb.from("profiles").select("id, title_gif_url").in("id", ids);
  }
  const rows = (res.data ?? []) as Array<Record<string, unknown>>;
  ids.forEach((id) => cache.set(id, []));
  rows.forEach((r) => {
    const list = normalize(r["vip_media"]);
    cache.set(String(r["id"]), list.length ? list : normalize(r["title_gif_url"]));
  });
  notify();
}

/** Yêu cầu nạp media VIP của 1 user (gộp batch, cache theo user). */
export function requestCloneVipMedia(userId?: string | null) {
  if (!userId || cache.has(userId) || pending.has(userId)) return;
  pending.add(userId);
  if (timer == null && typeof window !== "undefined") {
    timer = window.setTimeout(() => void flush(), 40);
  }
}

export function invalidateCloneVipMedia(ids?: string[]) {
  if (ids?.length) ids.forEach((id) => cache.delete(id));
  else cache.clear();
  notify();
}

/* ------------------------------ read/write ------------------------------ */

/** Đọc trực tiếp (dùng trong Admin Panel). */
export async function fetchCloneVipMedia(userId: string): Promise<string[]> {
  let res = await sb.from("profiles").select("vip_media, title_gif_url").eq("id", userId).maybeSingle();
  if (res.error && missingColumn(res.error.message)) {
    res = await sb.from("profiles").select("title_gif_url").eq("id", userId).maybeSingle();
  }
  if (res.error) throw new Error(res.error.message);
  const row = (res.data ?? {}) as Record<string, unknown>;
  const list = normalize(row["vip_media"]);
  return list.length ? list : normalize(row["title_gif_url"]);
}

/**
 * Gắn danh sách Media VIP (không giới hạn số lượng) cho nhiều clone.
 * Ghi `vip_media` (mảng) + giữ `title_gif_url` = URL đầu tiên để tương thích code cũ.
 */
export async function setCloneVipMedia(ids: string[], urls: string[]): Promise<number> {
  if (!ids.length) return 0;
  const clean = Array.from(new Set(urls.filter(Boolean)));
  const first = clean[0] ?? null;

  let res = await sb.from("profiles").update({ vip_media: clean, title_gif_url: first }).in("id", ids);
  if (res.error && missingColumn(res.error.message)) {
    res = await sb.from("profiles").update({ title_gif_url: first }).in("id", ids);
  }
  if (res.error) throw new Error(res.error.message);
  invalidateCloneVipMedia(ids);
  return ids.length;
}

/** Random & gán cho từng clone `count` media lấy từ pool (mỗi clone một bộ khác nhau). */
export async function randomizeCloneVipMedia(
  ids: string[],
  pool: string[],
  count: number,
): Promise<number> {
  if (!ids.length) return 0;
  if (!pool.length) throw new Error("Kho Media VIP đang trống");
  const n = Math.max(1, Math.min(count, pool.length));
  let done = 0;
  for (const id of ids) {
    const bag = pool.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    done += await setCloneVipMedia([id], bag.slice(0, n));
  }
  return done;
}
