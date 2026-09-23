import { createFileRoute } from "@tanstack/react-router";
import {
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  fetchBranding,
  type SiteBranding,
} from "@/lib/site/branding";

// App chính (MemoryRouter) được mount ở __root.tsx để KHÔNG bị unmount/remount
// khi URL đổi giữa "/" và các path khác của SPA (catch-all "/$").
// Route này chỉ còn khai báo metadata SEO — đọc từ Supabase 4 ngay trên server
// để Google đọc được trong mã nguồn trang.
export const Route = createFileRoute("/")({
  loader: async (): Promise<{ branding: SiteBranding | null }> => {
    try {
      return { branding: await fetchBranding(true) };
    } catch {
      return { branding: null };
    }
  },
  head: ({ loaderData }) => {
    const b = loaderData?.branding;
    const title = b?.seo_title || DEFAULT_SEO_TITLE;
    const description = b?.seo_description || DEFAULT_SEO_DESCRIPTION;
    const meta: { name?: string; property?: string; content: string; title?: string }[] = [
      { title } as any,
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (b?.seo_keywords) meta.push({ name: "keywords", content: b.seo_keywords });
    const share = b?.og_image_url || "";
    if (share.startsWith("http")) {
      meta.push({ property: "og:image", content: share });
      meta.push({ name: "twitter:image", content: share });
    }
    return { meta, links: [{ rel: "canonical", href: "/" }] };
  },
  component: () => null,
});
