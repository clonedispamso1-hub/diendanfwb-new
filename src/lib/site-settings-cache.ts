/**
 * site-settings-cache — nguồn đọc DUY NHẤT cho bảng `admin_site_settings`
 * (Supabase 1).
 *
 * Trước đây mỗi module (withdraw, vip unlock, admin contact, site links,
 * maintenance, verify gate…) tự gọi 1 request riêng mỗi lần mount → hàng chục
 * request/phiên. Nay:
 *  1. Gộp theo micro-task: mọi key yêu cầu trong cùng tick → 1 request
 *     `in('key', keys)`, chỉ select `key, value`.
 *  2. TTL 10 phút + sessionStorage → F5 / chuyển trang không gọi lại.
 *  3. In-flight dedupe theo key.
 */
import { supabase } from "@/lib/db/router";

export const SETTINGS_TTL = 10 * 60_000;
const SS_KEY = "sscache:v1";

type Entry = { at: number; value: unknown };

const mem = new Map<string, Entry>();
const waiting = new Map<string, Array<(v: unknown) => void>>();
let flushScheduled = false;

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
      if (v && now - v.at < SETTINGS_TTL) mem.set(k, v);
    }
  } catch { /* ignore */ }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, Entry> = {};
    const now = Date.now();
    for (const [k, v] of mem) if (now - v.at < SETTINGS_TTL) obj[k] = v;
    sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

export function peekSiteSetting<T = unknown>(key: string): T | undefined {
  hydrate();
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < SETTINGS_TTL) return hit.value as T;
  return undefined;
}

export function invalidateSiteSettings(key?: string) {
  if (key) mem.delete(key);
  else mem.clear();
  persist();
}

async function flush() {
  flushScheduled = false;
  const keys = [...waiting.keys()];
  if (keys.length === 0) return;
  const listeners = new Map(waiting);
  waiting.clear();

  let rows: Array<{ key: string; value: unknown }> = [];
  try {
    const { data } = await (supabase as any)
      .from("admin_site_settings")
      .select("key, value")
      .in("key", keys);
    rows = (data as any[]) ?? [];
  } catch { /* trả undefined → caller dùng default */ }

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const at = Date.now();
  for (const key of keys) {
    const value = byKey.get(key);
    mem.set(key, { at, value });
    for (const fn of listeners.get(key) || []) fn(value);
  }
  persist();
}

/** Đọc 1 setting (đã cache + gộp request). */
export function getSiteSetting<T = unknown>(key: string): Promise<T | undefined> {
  hydrate();
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < SETTINGS_TTL) return Promise.resolve(hit.value as T);

  return new Promise<T | undefined>((resolve) => {
    const list = waiting.get(key) ?? [];
    list.push((v) => resolve(v as T | undefined));
    waiting.set(key, list);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => { void flush(); });
    }
  });
}

/** Đọc nhiều setting cùng lúc — vẫn chỉ 1 request. */
export async function getSiteSettings(
  keys: string[],
): Promise<Record<string, unknown>> {
  const values = await Promise.all(keys.map((k) => getSiteSetting(k)));
  const out: Record<string, unknown> = {};
  keys.forEach((k, i) => { out[k] = values[i]; });
  return out;
}
