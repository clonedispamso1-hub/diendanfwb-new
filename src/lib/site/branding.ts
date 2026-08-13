/**
 * BRANDING — nguồn DUY NHẤT của logo website.
 *
 * • Lưu URL logo ở Supabase #2 (bảng site_settings2, key = `site_logo`) —
 *   KHÔNG đụng DB chính, không đổi URL/API key nào.
 * • Cache: memory + localStorage → chỉ request 1 lần cho mỗi phiên.
 * • Đổi logo trong Admin → phát event `site-logo:changed` → mọi nơi tự cập nhật,
 *   không cần build lại.
 * • Logo lỗi / chưa cấu hình → fallback logo mặc định.
 */
import defaultLogoAsset from "@/assets/brand/site-logo.jpg.asset.json";
import { getSetting2, setSetting2 } from "@/lib/site/db2-settings";

export const SITE_LOGO_KEY = "site_logo";
export const DEFAULT_LOGO_URL: string = defaultLogoAsset.url;

const LS_KEY = "site_logo_url_v1";
export const LOGO_EVENT = "site-logo:changed";

export interface SiteLogoConfig {
  url: string;
  updated_at?: string;
}

let memoryUrl: string | null = null;
let inflight: Promise<string> | null = null;

function readLocal(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v && /^https?:\/\/|^\//.test(v) ? v : null;
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

function emit(url: string) {
  try {
    window.dispatchEvent(new CustomEvent<string>(LOGO_EVENT, { detail: url }));
  } catch {
    /* ignore */
  }
}

/** URL dùng ngay khi render lần đầu (không await) — cache hoặc mặc định. */
export function getCachedLogoUrl(): string {
  return memoryUrl ?? readLocal() ?? DEFAULT_LOGO_URL;
}

/** Đọc logo từ nguồn duy nhất (dedupe request, cache lại). */
export async function fetchSiteLogo(force = false): Promise<string> {
  if (!force && memoryUrl) return memoryUrl;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const raw = await getSetting2<Partial<SiteLogoConfig> | null>(SITE_LOGO_KEY, false);
      const url = typeof raw?.url === "string" && raw.url.trim() ? raw.url.trim() : DEFAULT_LOGO_URL;
      memoryUrl = url;
      writeLocal(url === DEFAULT_LOGO_URL ? null : url);
      emit(url);
      return url;
    } catch {
      return getCachedLogoUrl();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Admin: lưu logo mới → cache refresh + phát event cho toàn site. */
export async function saveSiteLogo(url: string): Promise<void> {
  const clean = url.trim();
  await setSetting2(SITE_LOGO_KEY, { url: clean, updated_at: new Date().toISOString() });
  memoryUrl = clean || DEFAULT_LOGO_URL;
  writeLocal(clean && clean !== DEFAULT_LOGO_URL ? clean : null);
  emit(memoryUrl);
}

/** Admin: xoá / khôi phục logo mặc định. */
export async function resetSiteLogo(): Promise<void> {
  await setSetting2(SITE_LOGO_KEY, { url: "", updated_at: new Date().toISOString() });
  memoryUrl = DEFAULT_LOGO_URL;
  writeLocal(null);
  emit(DEFAULT_LOGO_URL);
}
