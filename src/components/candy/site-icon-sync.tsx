/**
 * SiteIconSync — đồng bộ logo website (SiteSettings.logo_url) sang:
 * favicon, shortcut icon, apple-touch-icon (Safari), PWA manifest icon,
 * Open Graph image và Twitter image.
 *
 * Không hardcode logo ở đâu nữa: mọi thứ đọc từ nguồn duy nhất `useSiteLogo()`.
 */
import { useEffect } from "react";
import { useSiteLogo } from "@/components/candy/site-logo";

function setLink(rel: string, href: string, extra?: Record<string, string>) {
  const selector = `link[rel="${rel}"]`;
  const nodes = Array.from(document.head.querySelectorAll<HTMLLinkElement>(selector));
  if (nodes.length === 0) {
    const el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
    nodes.push(el);
  }
  for (const el of nodes) {
    el.href = href;
    if (extra) for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
  }
}

function setMeta(attr: "property" | "name", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function SiteIconSync() {
  const logo = useSiteLogo();

  useEffect(() => {
    if (typeof document === "undefined" || !logo) return;
    const absolute = logo.startsWith("http")
      ? logo
      : `${window.location.origin}${logo}`;

    // Favicon + shortcut + Safari touch icon
    setLink("icon", absolute);
    setLink("shortcut icon", absolute);
    setLink("apple-touch-icon", absolute, { sizes: "180x180" });
    setLink("mask-icon", absolute);

    // SEO / Open Graph
    setMeta("property", "og:image", absolute);
    setMeta("name", "twitter:image", absolute);

    // PWA manifest — sinh động theo logo hiện tại
    let objectUrl: string | null = null;
    try {
      const manifest = {
        name: "Diễn Đàn FWB",
        short_name: "Diễn Đàn FWB",
        icons: [
          { src: absolute, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: absolute, sizes: "512x512", type: "image/png", purpose: "any" },
        ],
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
      };
      objectUrl = URL.createObjectURL(
        new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
      );
      setLink("manifest", objectUrl);
    } catch {
      /* ignore */
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logo]);

  return null;
}

export default SiteIconSync;
