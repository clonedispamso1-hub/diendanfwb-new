/**
 * Cấu hình Auto-Post (Kịch bản Up Bài).
 *
 * Lưu trong kho `site_settings2` (Supabase #2) qua `@/lib/site/db2-settings`
 * → không đụng DB chính, không polling (đọc 1 lần + cache trong phiên).
 */
import { getSetting2, setSetting2 } from "@/lib/site/db2-settings";

export const AUTOPOST_CONFIG_KEY = "autopost_config";

export interface AutopostConfig {
  /** Giãn cách tối thiểu giữa 2 bài (phút). */
  gapMin: number;
  /** Giãn cách tối đa giữa 2 bài (phút). */
  gapMax: number;
  /** Giờ bắt đầu khung hoạt động, dạng "HH:mm". */
  activeFrom: string;
  /** Giờ kết thúc khung hoạt động, dạng "HH:mm". */
  activeTo: string;
  /** Bật/tắt runner tự động. */
  enabled: boolean;
}

export const DEFAULT_AUTOPOST_CONFIG: AutopostConfig = {
  gapMin: 15,
  gapMax: 30,
  activeFrom: "07:00",
  activeTo: "23:00",
  enabled: true,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function num(v: unknown, fb: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fb;
  return Math.min(Math.max(n, min), max);
}

function hhmm(v: unknown, fb: string): string {
  return typeof v === "string" && HHMM.test(v.trim()) ? v.trim() : fb;
}

export function normalizeAutopostConfig(raw: unknown): AutopostConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const gapMin = num(o.gapMin, DEFAULT_AUTOPOST_CONFIG.gapMin, 1, 24 * 60);
  const gapMaxRaw = num(o.gapMax, DEFAULT_AUTOPOST_CONFIG.gapMax, 1, 24 * 60);
  return {
    gapMin,
    gapMax: Math.max(gapMin, gapMaxRaw),
    activeFrom: hhmm(o.activeFrom, DEFAULT_AUTOPOST_CONFIG.activeFrom),
    activeTo: hhmm(o.activeTo, DEFAULT_AUTOPOST_CONFIG.activeTo),
    enabled: o.enabled === undefined ? DEFAULT_AUTOPOST_CONFIG.enabled : o.enabled === true,
  };
}

/** Đọc cấu hình (mặc định nếu chưa có). */
export async function fetchAutopostConfig(useCache = true): Promise<AutopostConfig> {
  return normalizeAutopostConfig(await getSetting2<unknown>(AUTOPOST_CONFIG_KEY, useCache));
}

/** Ghi cấu hình (Admin Panel). */
export async function saveAutopostConfig(cfg: AutopostConfig): Promise<AutopostConfig> {
  const clean = normalizeAutopostConfig(cfg);
  await setSetting2(AUTOPOST_CONFIG_KEY, clean);
  return clean;
}

/* ------------------------------ Helper giờ ------------------------------ */

/** "HH:mm" → số phút kể từ 00:00. */
export function toMinutes(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(":").map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Số phút trong ngày của 1 mốc thời gian. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Mốc thời gian có nằm trong khung giờ hoạt động không. */
export function isWithinActiveWindow(d: Date, cfg: AutopostConfig): boolean {
  const cur = minutesOfDay(d);
  const from = toMinutes(cfg.activeFrom);
  const to = toMinutes(cfg.activeTo);
  // Khung qua đêm (vd 22:00 → 06:00)
  if (from > to) return cur >= from || cur < to;
  return cur >= from && cur < to;
}

/** Đẩy mốc thời gian vào khung hoạt động gần nhất (07:00 hôm sau nếu đã quá 23:00). */
export function clampToActiveWindow(d: Date, cfg: AutopostConfig): Date {
  if (isWithinActiveWindow(d, cfg)) return new Date(d);
  const from = toMinutes(cfg.activeFrom);
  const out = new Date(d);
  out.setSeconds(0, 0);
  const cur = minutesOfDay(d);
  const to = toMinutes(cfg.activeTo);
  const beforeStartSameDay = from <= to ? cur < from : false;
  if (!beforeStartSameDay) out.setDate(out.getDate() + 1); // sang hôm sau
  out.setHours(Math.floor(from / 60), from % 60, 0, 0);
  return out;
}

/** Giãn cách ngẫu nhiên (ms) theo cấu hình. */
export function randomGapMs(cfg: AutopostConfig): number {
  const min = Math.min(cfg.gapMin, cfg.gapMax);
  const max = Math.max(cfg.gapMin, cfg.gapMax);
  const minutes = min + Math.random() * (max - min);
  return Math.round(minutes * 60 * 1000);
}
