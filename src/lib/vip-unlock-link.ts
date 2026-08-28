/**
 * Link "Liên hệ Admin" DÙNG CHUNG cho popup mở khoá VIP toàn website.
 *
 * Nguồn duy nhất (theo thứ tự ưu tiên) trong bảng `admin_site_settings`:
 *   1. vip_contact_link
 *   2. community_link
 *   3. admin_contact_url  (giữ tương thích cấu hình cũ)
 *
 * Đổi 1 lần trong Admin → toàn bộ popup trên website đổi theo.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";
import { getSiteSettings } from "@/lib/site-settings-cache";

export const VIP_LINK_KEYS = ["vip_contact_link", "community_link", "admin_contact_url"] as const;

const DEFAULT_URL = "https://www.facebook.com/share/1BjMYa8H27/?mibextid=wwXIfr";
const EVENT = "vip-unlock-link-changed";

let cached: string | null = null;
let inflight: Promise<string> | null = null;

function pick(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const v = value as Record<string, unknown>;
  const raw = v.url ?? v.link ?? v.value ?? v.href;
  return typeof raw === "string" ? raw.trim() : "";
}

export async function fetchVipUnlockLink(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const values = await getSiteSettings(VIP_LINK_KEYS as unknown as string[]);
      for (const key of VIP_LINK_KEYS) {
        const hit = pick(values[key]);
        if (hit) {
          cached = hit;
          return cached;
        }
      }
      cached = DEFAULT_URL;
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

export function invalidateVipUnlockLink() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

export function useVipUnlockLink(override?: string | null): string {
  const [url, setUrl] = useState<string>(override?.trim() || cached || DEFAULT_URL);

  useEffect(() => {
    if (override && override.trim()) {
      setUrl(override.trim());
      return;
    }
    let alive = true;
    void fetchVipUnlockLink().then((v) => alive && setUrl(v));
    const on = () => {
      void fetchVipUnlockLink().then((v) => alive && setUrl(v));
    };
    window.addEventListener(EVENT, on);
    window.addEventListener("admin-contact-url-changed", on);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, on);
      window.removeEventListener("admin-contact-url-changed", on);
    };
  }, [override]);

  return url;
}
