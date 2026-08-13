/**
 * Supabase Primary provider — Supabase #1 (project chính).
 *
 * CHỈ ĐỌC: không upload gì lên Supabase #1 (upload luôn đi qua Supabase #2 /
 * Cloudinary). Provider này tồn tại để mọi URL media CŨ đang nằm trong
 * Storage của Supabase #1 cũng được phục vụ qua endpoint `render/image`
 * (resize + quality 70 + cache lâu) thay vì tải bản gốc.
 *
 * Không đổi URL project, không đổi API key, không đổi dữ liệu.
 */
import type { MediaProvider, UploadedMedia } from "../types";
import { storageTransformDisabled } from "@/lib/image-cdn";

/** Bất kỳ URL public nào của Supabase Storage. */
const SB_PUBLIC_RE = /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i;

export function createSupabasePrimaryProvider(config: { name: string }): MediaProvider {
  return {
    name: config.name,

    isEnabled() {
      // Read-only provider: không bao giờ được chọn để upload.
      return false;
    },

    ownsUrl(url) {
      return SB_PUBLIC_RE.test(url);
    },

    async upload(): Promise<UploadedMedia> {
      throw new Error("Supabase #1 chỉ dùng để đọc media, không upload.");
    },

    buildUrl(url) {
      return url;
    },

    buildThumb(url, width) {
      if (storageTransformDisabled()) return url;
      if (!url.includes("/storage/v1/object/public/")) return url;
      // GIF mất animation khi qua render/image → giữ nguyên.
      if (/\.gif($|\?)/i.test(url)) return url;
      const rendered = url.replace("/object/public/", "/render/image/public/");
      return `${rendered}?width=${Math.round(width)}&resize=contain&quality=70`;
    },
  };
}
