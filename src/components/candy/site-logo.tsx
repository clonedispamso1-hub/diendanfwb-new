/**
 * SiteLogo — component DUY NHẤT hiển thị logo website.
 * Mọi nơi (Login, Register, Header, Sidebar, Blocked, Admin…) đều dùng component này.
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_LOGO_URL,
  LOGO_EVENT,
  fetchSiteLogo,
  getCachedLogoUrl,
} from "@/lib/site/branding";

/** Hook: URL logo hiện tại, tự cập nhật khi Admin đổi logo. */
export function useSiteLogo(): string {
  const [url, setUrl] = useState<string>(() => getCachedLogoUrl());

  useEffect(() => {
    let alive = true;
    void fetchSiteLogo().then((u) => {
      if (alive) setUrl(u);
    });
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (typeof next === "string" && next) setUrl(next);
    };
    window.addEventListener(LOGO_EVENT, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(LOGO_EVENT, onChange as EventListener);
    };
  }, []);

  return url;
}

interface SiteLogoProps {
  /** Chiều cao logo (px). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  /** Ưu tiên tải ngay (Header / màn đăng nhập). */
  priority?: boolean;
}

export function SiteLogo({
  size = 40,
  className = "",
  style,
  alt = "Logo website",
  priority = false,
}: SiteLogoProps) {
  const url = useSiteLogo();
  const [broken, setBroken] = useState(false);

  return (
    <img
      src={broken ? DEFAULT_LOGO_URL : url}
      alt={alt}
      className={`site-logo ${className}`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setBroken(true)}
      style={{ height: size, width: "auto", objectFit: "contain", ...style }}
    />
  );
}

export default SiteLogo;
