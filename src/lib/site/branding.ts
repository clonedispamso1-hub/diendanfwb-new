/**
 * BRANDING — nguồn DUY NHẤT của nhận diện website:
 * logo (URL + kích thước), favicon, và SEO (title / description / keywords / ảnh chia sẻ).
 *
 * • Lưu ở SUPABASE 4 (bảng public.site_branding, 1 dòng id='main'),
 *   file ảnh nằm trong bucket công khai `site-branding` của Supabase 4.
 *   SQL: supabase-sql/SB4/2026-09-21_site_branding.sql
 * • Cache: memory + localStorage → render ngay, không chớp logo.
 * • Admin lưu → phát event `site-logo:changed` → toàn site cập nhật, không build lại.
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";
import { getSetting2 } from "@/lib/site/db2-settings";

export const SITE_LOGO_KEY = "site_logo";
export const DEFAULT_LOGO_URL = "/logo.png";
export const BRANDING_BUCKET = "site-branding";

/** Kích thước (chiều cao, px) mặc định + giới hạn cho Admin. */
export const DEFAULT_LOGO_SIZE = 56;
export const LOGO_SIZE_MIN = 40;
export const LOGO_SIZE_MAX = 120;

export const DEFAULT_SEO_TITLE = "Diễn Đàn FWB — Kết nối uy tín";
export const DEFAULT_SEO_DESCRIPTION =
  "Diễn Đàn FWB là mạng xã hội kết nối uy tín, nơi trò chuyện và chia sẻ khoảnh khắc cùng bạn bè.";

const LS_KEY = "site_logo_url_v1";
const LS_SIZE_KEY = "site_logo_size_v1";
const LS_BRANDING_KEY = "site_branding_v1";
export const LOGO_EVENT = "site-logo:changed";

export interface SiteLogoConfig {
  url: string;
  size: number;
  updated_at?: string;
}

export interface SiteBranding {
  logo_url: string;
  logo_size: number;
  favicon_url: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  og_image_url: string;
}

export const DEFAULT_BRANDING: SiteBranding = {
  logo_url: DEFAULT_LOGO_URL,
  logo_size: DEFAULT_LOGO_SIZE,
  favicon_url: "",
  seo_title: DEFAULT_SEO_TITLE,
  seo_description: DEFAULT_SEO_DESCRIPTION,
  seo_keywords: "",
  og_image_url: "",
};

export const BRANDING_EVENT = "site-branding:changed";

let memory: SiteBranding | null = null;
let inflight: Promise<SiteBranding> | null = null;

export function clampLogoSize(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOGO_SIZE;
  return Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, n));
}

function str(v: unknown, fb = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fb;
}

function normalize(raw: unknown): SiteBranding {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    logo_url: str(o.logo_url, DEFAULT_LOGO_URL),
    logo_size: clampLogoSize(o.logo_size ?? DEFAULT_LOGO_SIZE),
    favicon_url: str(o.favicon_url),
    seo_title: str(o.seo_title, DEFAULT_SEO_TITLE),
    seo_description: str(o.seo_description, DEFAULT_SEO_DESCRIPTION),
    seo_keywords: str(o.seo_keywords),
    og_image_url: str(o.og_image_url),
  };
}

function readLocal(): SiteBranding | null {
  try {
    const raw = localStorage.getItem(LS_BRANDING_KEY);
    if (raw) return normalize(JSON.parse(raw));
    // Tương thích bản cũ (chỉ có logo).
    const url = localStorage.getItem(LS_KEY);
    const size = Number(localStorage.getItem(LS_SIZE_KEY));
    if (url) return normalize({ logo_url: url, logo_size: size });
    return null;
  } catch {
    return null;
  }
}

function writeLocal(b: SiteBranding) {
  try {
    localStorage.setItem(LS_BRANDING_KEY, JSON.stringify(b));
    if (b.logo_url && b.logo_url !== DEFAULT_LOGO_URL) localStorage.setItem(LS_KEY, b.logo_url);
    else localStorage.removeItem(LS_KEY);
    localStorage.setItem(LS_SIZE_KEY, String(b.logo_size));
  } catch {
    /* ignore */
  }
}

function emit(b: SiteBranding) {
  try {
    window.dispatchEvent(
      new CustomEvent<SiteLogoConfig>(LOGO_EVENT, {
        detail: { url: b.logo_url, size: b.logo_size },
      }),
    );
    window.dispatchEvent(new CustomEvent<SiteBranding>(BRANDING_EVENT, { detail: b }));
  } catch {
    /* ignore */
  }
}

/** Cấu hình dùng ngay khi render lần đầu (không await). */
export function getCachedBranding(): SiteBranding {
  if (memory) return memory;
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  return readLocal() ?? DEFAULT_BRANDING;
}

export function getCachedLogoUrl(): string {
  return getCachedBranding().logo_url;
}

export function getCachedLogoSize(): number {
  return getCachedBranding().logo_size;
}

export function getCachedLogoConfig(): SiteLogoConfig {
  const b = getCachedBranding();
  return { url: b.logo_url, size: b.logo_size };
}

/** Đọc nhận diện từ Supabase 4 (dedupe request, cache lại). */
export async function fetchBranding(force = false): Promise<SiteBranding> {
  if (!force && memory) return memory;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await sb4()
        .from("site_branding")
        .select("*")
        .eq("id", "main")
        .maybeSingle();
      if (error) throw new Error(error.message);

      let next = normalize(data);

      // Lần đầu (SB4 chưa có logo) → chuyển tiếp logo cũ ở Supabase 2, không mất logo đang dùng.
      if (!data || (!str((data as any).logo_url) && typeof window !== "undefined")) {
        try {
          const legacy = await getSetting2<{ url?: string; size?: number } | null>(
            SITE_LOGO_KEY,
            false,
          );
          if (legacy && str(legacy.url)) {
            next = {
              ...next,
              logo_url: str(legacy.url, DEFAULT_LOGO_URL),
              logo_size: clampLogoSize(legacy.size ?? next.logo_size),
            };
            await saveBranding({ logo_url: next.logo_url, logo_size: next.logo_size }).catch(
              () => undefined,
            );
          }
        } catch {
          /* bỏ qua — vẫn dùng dữ liệu SB4 */
        }
      }

      memory = next;
      if (typeof window !== "undefined") {
        writeLocal(next);
        emit(next);
      }
      return next;
    } catch {
      return getCachedBranding();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Ghi một phần cấu hình nhận diện → cập nhật cache + phát event toàn site. */
export async function saveBranding(patch: Partial<SiteBranding>): Promise<SiteBranding> {
  const current = memory ?? getCachedBranding();
  const next = normalize({ ...current, ...patch });

  const { error } = await sb4Admin()
    .from("site_branding")
    .upsert(
      {
        id: "main",
        logo_url: next.logo_url === DEFAULT_LOGO_URL ? null : next.logo_url,
        logo_size: next.logo_size,
        favicon_url: next.favicon_url || null,
        seo_title: next.seo_title,
        seo_description: next.seo_description,
        seo_keywords: next.seo_keywords || null,
        og_image_url: next.og_image_url || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);

  memory = next;
  if (typeof window !== "undefined") {
    writeLocal(next);
    emit(next);
  }
  return next;
}

/** Tải ảnh nhận diện (logo / favicon / ảnh chia sẻ) lên Supabase 4. */
export async function uploadBrandingImage(
  file: File,
  kind: "logo" | "favicon" | "og",
): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${kind}-${Date.now()}.${ext}`;
  const client = sb4Admin();
  const { error } = await client.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* ------------------------- Tương thích API cũ (logo) ------------------------- */

export async function fetchSiteLogoConfig(force = false): Promise<SiteLogoConfig> {
  const b = await fetchBranding(force);
  return { url: b.logo_url, size: b.logo_size };
}

export async function fetchSiteLogo(force = false): Promise<string> {
  return (await fetchBranding(force)).logo_url;
}

export async function saveSiteLogo(url: string): Promise<void> {
  await saveBranding({ logo_url: url.trim() || DEFAULT_LOGO_URL });
}

export async function saveSiteLogoSize(size: number): Promise<number> {
  const clean = clampLogoSize(size);
  await saveBranding({ logo_size: clean });
  return clean;
}

export async function resetSiteLogo(): Promise<void> {
  await saveBranding({ logo_url: DEFAULT_LOGO_URL });
}
