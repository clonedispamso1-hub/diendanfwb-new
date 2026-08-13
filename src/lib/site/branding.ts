/**
 * BRANDING — nguồn DUY NHẤT của logo website (URL + kích thước).
 *
 * • Lưu ở Supabase #2 (bảng site_settings2, key = `site_logo`) —
 *   KHÔNG đụng DB chính, không đổi URL/API key nào.
 * • Cache: memory + localStorage → chỉ request 1 lần cho mỗi phiên.
 * • Đổi logo / kích thước trong Admin → phát event `site-logo:changed` →
 *   mọi nơi tự cập nhật, không cần build lại.
 * • Logo lỗi / chưa cấu hình → fallback logo mặc định.
 */
import { getSetting2, setSetting2 } from "@/lib/site/db2-settings";

export const SITE_LOGO_KEY = "site_logo";
export const DEFAULT_LOGO_URL = "/logo.png";

/** Kích thước (chiều cao, px) mặc định + giới hạn cho Admin. */
export const DEFAULT_LOGO_SIZE = 56;
export const LOGO_SIZE_MIN = 40;
export const LOGO_SIZE_MAX = 120;

const LS_KEY = "site_logo_url_v1";
const LS_SIZE_KEY = "site_logo_size_v1";
export const LOGO_EVENT = "site-logo:changed";

export interface SiteLogoConfig {
  url: string;
  size: number;
  updated_at?: string;
}

let memoryUrl: string | null = null;
let memorySize: number | null = null;
let inflight: Promise<SiteLogoConfig> | null = null;

export function clampLogoSize(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOGO_SIZE;
  return Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, n));
}

function readLocal(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v && /^https?:\/\/|^\//.test(v) ? v : null;
  } catch {
    return null;
  }
}

function readLocalSize(): number | null {
  try {
    const v = localStorage.getItem(LS_SIZE_KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? clampLogoSize(n) : null;
  } catch {
    return null;
  }
}

function writeLocal(url: string | null) {
  try {
    if (url) localStorage.setItem(LS_KEY, url);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

function writeLocalSize(size: number | null) {
  try {
    if (size) localStorage.setItem(LS_SIZE_KEY, String(size));
    else localStorage.removeItem(LS_SIZE_KEY);
  } catch {
    /* ignore */
  }
}

function emit(cfg: SiteLogoConfig) {
  try {
    window.dispatchEvent(new CustomEvent<SiteLogoConfig>(LOGO_EVENT, { detail: cfg }));
  } catch {
    /* ignore */
  }
}

/** URL dùng ngay khi render lần đầu (không await) — cache hoặc mặc định. */
export function getCachedLogoUrl(): string {
  return memoryUrl ?? readLocal() ?? DEFAULT_LOGO_URL;
}

/** Kích thước dùng ngay khi render lần đầu (không await). */
export function getCachedLogoSize(): number {
  return memorySize ?? readLocalSize() ?? DEFAULT_LOGO_SIZE;
}

export function getCachedLogoConfig(): SiteLogoConfig {
  return { url: getCachedLogoUrl(), size: getCachedLogoSize() };
}

/** Đọc logo (URL + size) từ nguồn duy nhất (dedupe request, cache lại). */
export async function fetchSiteLogoConfig(force = false): Promise<SiteLogoConfig> {
  if (!force && memoryUrl && memorySize) return { url: memoryUrl, size: memorySize };
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const raw = await getSetting2<Partial<SiteLogoConfig> | null>(SITE_LOGO_KEY, false);
      const url = typeof raw?.url === "string" && raw.url.trim() ? raw.url.trim() : DEFAULT_LOGO_URL;
      const size = clampLogoSize(raw?.size ?? DEFAULT_LOGO_SIZE);
      memoryUrl = url;
      memorySize = size;
      writeLocal(url === DEFAULT_LOGO_URL ? null : url);
      writeLocalSize(size);
      emit({ url, size });
      return { url, size };
    } catch {
      return getCachedLogoConfig();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Tương thích cũ: chỉ lấy URL. */
export async function fetchSiteLogo(force = false): Promise<string> {
  return (await fetchSiteLogoConfig(force)).url;
}

/** Admin: lưu logo mới → cache refresh + phát event cho toàn site. */
export async function saveSiteLogo(url: string): Promise<void> {
  const clean = url.trim();
  const size = getCachedLogoSize();
  await setSetting2(SITE_LOGO_KEY, { url: clean, size, updated_at: new Date().toISOString() });
  memoryUrl = clean || DEFAULT_LOGO_URL;
  memorySize = size;
  writeLocal(clean && clean !== DEFAULT_LOGO_URL ? clean : null);
  writeLocalSize(size);
  emit({ url: memoryUrl, size });
}

/** Admin: lưu kích thước logo (px) → toàn site cập nhật ngay. */
export async function saveSiteLogoSize(size: number): Promise<number> {
  const clean = clampLogoSize(size);
  const url = getCachedLogoUrl();
  await setSetting2(SITE_LOGO_KEY, {
    url: url === DEFAULT_LOGO_URL ? "" : url,
    size: clean,
    updated_at: new Date().toISOString(),
  });
  memoryUrl = url;
  memorySize = clean;
  writeLocalSize(clean);
  emit({ url, size: clean });
  return clean;
}

/** Admin: xoá / khôi phục logo mặc định (giữ kích thước đang chọn). */
export async function resetSiteLogo(): Promise<void> {
  const size = getCachedLogoSize();
  await setSetting2(SITE_LOGO_KEY, { url: "", size, updated_at: new Date().toISOString() });
  memoryUrl = DEFAULT_LOGO_URL;
  memorySize = size;
  writeLocal(null);
  writeLocalSize(size);
  emit({ url: DEFAULT_LOGO_URL, size });
}
