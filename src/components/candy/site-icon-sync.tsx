/**
 * SiteIconSync — đồng bộ nhận diện website (Supabase 4) sang:
 * favicon, shortcut icon, apple-touch-icon (Safari), PWA manifest icon,
 * tiêu đề SEO, mô tả, từ khoá, Open Graph và Twitter image.
 *
 * Nguồn duy nhất: `useBranding()` — không hardcode ở đâu nữa.
 */
import { useEffect } from "react";
import { useBranding } from "@/components/candy/site-branding";

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
  const b = useBranding();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const abs = (u: string) => (u.startsWith("http") ? u : `${window.location.origin}${u}`);
    const iconSrc = b.favicon_url || b.logo_url;
    const icon = iconSrc ? abs(iconSrc) : "";
    const share = b.og_image_url ? abs(b.og_image_url) : icon;

    if (icon) {
      // Favicon + shortcut + Safari touch icon
      setLink("icon", icon);
      setLink("shortcut icon", icon);
      setLink("apple-touch-icon", icon, { sizes: "180x180" });
      setLink("mask-icon", icon);
    }

    // SEO
    if (b.seo_title) {
      document.title = b.seo_title;
      setMeta("property", "og:title", b.seo_title);
      setMeta("name", "twitter:title", b.seo_title);
    }
    if (b.seo_description) {
      setMeta("name", "description", b.seo_description);
      setMeta("property", "og:description", b.seo_description);
      setMeta("name", "twitter:description", b.seo_description);
    }
    if (b.seo_keywords) setMeta("name", "keywords", b.seo_keywords);
    if (share) {
      setMeta("property", "og:image", share);
      setMeta("name", "twitter:image", share);
    }

    // PWA manifest — sinh động theo icon hiện tại
    let objectUrl: string | null = null;
    if (icon) {
      try {
        const manifest = {
          name: b.seo_title || "Diễn Đàn FWB",
          short_name: b.seo_title || "Diễn Đàn FWB",
          icons: [
            { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
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
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [b]);

  return null;
}

export default SiteIconSync;
