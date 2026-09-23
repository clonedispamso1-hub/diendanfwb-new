/**
 * useBranding — hook đọc nhận diện website dùng chung (logo, favicon, SEO)
 * từ nguồn DUY NHẤT trên Supabase 4. Tự cập nhật khi Admin lưu.
 */
import { useEffect, useState } from "react";
import {
  BRANDING_EVENT,
  fetchBranding,
  getCachedBranding,
  type SiteBranding,
} from "@/lib/site/branding";

export function useBranding(): SiteBranding {
  const [cfg, setCfg] = useState<SiteBranding>(() => getCachedBranding());

  useEffect(() => {
    let alive = true;
    void fetchBranding().then((b) => {
      if (alive) setCfg(b);
    });
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<SiteBranding>).detail;
      if (next && typeof next === "object") setCfg(next);
    };
    window.addEventListener(BRANDING_EVENT, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(BRANDING_EVENT, onChange as EventListener);
    };
  }, []);

  return cfg;
}

export default useBranding;
