/**
 * LIÊN KẾT WEBSITE — nguồn dữ liệu DUY NHẤT cho Facebook Fanpage & Nhóm Zalo.
 *
 * Lưu ở `admin_site_settings.key = 'site_links'` (Admin Panel → Quản lý Website → Liên kết).
 * Admin đổi 1 lần → toàn website cập nhật, KHÔNG hardcode link ở bất kỳ đâu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminSetSiteSetting } from "@/lib/admin-db";

export const SITE_LINKS_KEY = "site_links";
export const SITE_LINKS_EVENT = "site-links-changed";

export interface SiteLinks {
  /** https://facebook.com/... */
  facebook_page: string;
  /** https://zalo.me/g/... */
  zalo_group: string;
}

export const DEFAULT_SITE_LINKS: SiteLinks = { facebook_page: "", zalo_group: "" };

let cached: SiteLinks | null = null;
let inflight: Promise<SiteLinks> | null = null;

function normalize(raw: unknown): SiteLinks {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  return {
    facebook_page: s("facebook_page") || s("facebook") || s("fanpage"),
    zalo_group: s("zalo_group") || s("zalo") || s("group"),
  };
}

export async function fetchSiteLinks(): Promise<SiteLinks> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", SITE_LINKS_KEY)
        .maybeSingle();
      cached = normalize(data?.value);
    } catch {
      cached = DEFAULT_SITE_LINKS;
    } finally {
      inflight = null;
    }
    return cached as SiteLinks;
  })();
  return inflight;
}

export function invalidateSiteLinks() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SITE_LINKS_EVENT));
}

export async function saveSiteLinks(links: SiteLinks): Promise<void> {
  await adminSetSiteSetting(SITE_LINKS_KEY, normalize(links));
  invalidateSiteLinks();
}

export function useSiteLinks(): SiteLinks {
  const [links, setLinks] = useState<SiteLinks>(cached ?? DEFAULT_SITE_LINKS);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchSiteLinks().then((v) => {
        if (alive) setLinks(v);
      });
    };
    load();
    const on = () => {
      cached = null;
      load();
    };
    window.addEventListener(SITE_LINKS_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(SITE_LINKS_EVENT, on);
    };
  }, []);
  return links;
}
