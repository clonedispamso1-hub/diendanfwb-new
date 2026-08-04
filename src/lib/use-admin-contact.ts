/**
 * useAdminContactUrl — global "Liên hệ Admin" link. Chỉnh trong Admin Settings
 * (admin_site_settings key = 'admin_contact_url') và mọi UI dùng chung ngay.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_URL = "https://www.facebook.com/share/1BjMYa8H27/?mibextid=wwXIfr";
let cached: string | null = null;
let inflight: Promise<string> | null = null;

async function fetchUrl(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", "admin_contact_url")
        .maybeSingle();
      const v = data?.value?.url || data?.value?.value || null;
      cached = typeof v === "string" && v.trim() ? v.trim() : DEFAULT_URL;
      return cached;
    } catch {
      cached = DEFAULT_URL;
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateAdminContactCache() { cached = null; }

export function useAdminContactUrl(): string {
  const [url, setUrl] = useState<string>(cached ?? DEFAULT_URL);
  useEffect(() => {
    let alive = true;
    fetchUrl().then((v) => { if (alive) setUrl(v); });
    const on = () => { invalidateAdminContactCache(); fetchUrl().then((v) => alive && setUrl(v)); };
    window.addEventListener("admin-contact-url-changed", on);
    return () => { alive = false; window.removeEventListener("admin-contact-url-changed", on); };
  }, []);
  return url;
}
