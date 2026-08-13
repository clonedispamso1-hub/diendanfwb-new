/**
 * SiteLogo — component DUY NHẤT hiển thị logo website.
 * Mọi nơi (Login, Register, Header, Sidebar, Blocked, Admin…) đều dùng component này.
 * Kích thước mặc định đọc từ Site Settings (logo_size) — KHÔNG hardcode ở component.
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_LOGO_URL,
  LOGO_EVENT,
  fetchSiteLogoConfig,
  getCachedLogoConfig,
  type SiteLogoConfig,
} from "@/lib/site/branding";

/** Hook: cấu hình logo hiện tại (url + size), tự cập nhật khi Admin đổi. */
export function useSiteLogoConfig(): SiteLogoConfig {
  const [cfg, setCfg] = useState<SiteLogoConfig>(() => getCachedLogoConfig());

  useEffect(() => {
    let alive = true;
    void fetchSiteLogoConfig().then((c) => {
      if (alive) setCfg(c);
    });
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<SiteLogoConfig>).detail;
      if (next && typeof next === "object" && next.url) setCfg(next);
    };
    window.addEventListener(LOGO_EVENT, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(LOGO_EVENT, onChange as EventListener);
    };
  }, []);

  return cfg;
}

/** Hook: URL logo hiện tại. */
export function useSiteLogo(): string {
  return useSiteLogoConfig().url;
}

/** Hook: chiều cao logo (px) theo Site Settings. */
export function useSiteLogoSize(): number {
  return useSiteLogoConfig().size;
}

interface SiteLogoProps {
  /** Chiều cao logo (px). Bỏ trống = dùng Site Settings (logo_size). */
  size?: number;
  /** Hệ số nhân so với logo_size (vd 1.6 cho màn đăng nhập). */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  /** Ưu tiên tải ngay (Header / màn đăng nhập). */
  priority?: boolean;
}

export function SiteLogo({
  size,
  scale = 1,
  className = "",
  style,
  alt = "Logo website",
  priority = false,
}: SiteLogoProps) {
  const { url, size: settingsSize } = useSiteLogoConfig();
  const [broken, setBroken] = useState(false);

  const fixed = typeof size === "number";
  const height = Math.round((fixed ? (size as number) : settingsSize) * scale);

  return (
    <img
      src={broken ? DEFAULT_LOGO_URL : url}
      alt={alt}
      className={`site-logo${fixed ? " site-logo--fixed" : ""} ${className}`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setBroken(true)}
      style={
        {
          "--site-logo-h": `${height}px`,
          height: "var(--site-logo-h)",
          width: "auto",
          objectFit: "contain",
          ...style,
        } as React.CSSProperties
      }
    />
  );
}

export default SiteLogo;
