/**
 * Supabase #3 (logs/stats) — Storage provider CHỈ dùng bucket SẴN CÓ `feedback`.
 *
 * • Ghi file đi qua endpoint server `/api/public/sb3-upload` (yêu cầu đăng nhập).
 *   Service Role Key của Supabase #3 nằm HOÀN TOÀN ở server, không bao giờ
 *   xuất hiện trong code/biến môi trường của trình duyệt.
 * • Không tạo bucket mới, không đổi RLS, không đụng Supabase #1/#2/#4.
 * • Ảnh PHẢI được nén ở trình duyệt trước khi gọi provider này.
 */
import type { MediaProvider, UploadedMedia } from "../types";
import { supabase } from "@/lib/supabase";

/** URL public của Supabase #3 (an toàn — chỉ đọc). */
export const SB3_STORAGE_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
/** Bucket public ĐÃ TỒN TẠI trên Supabase #3. */
export const SB3_BUCKET = "feedback";

const PUBLIC_PREFIX = `${SB3_STORAGE_URL}/storage/v1/object/public/${SB3_BUCKET}/`;

export interface SupabaseLogsConfig {
  name?: string;
  endpoint?: string;
}

export function createSupabaseLogsProvider(cfg: SupabaseLogsConfig = {}): MediaProvider {
  const name = cfg.name ?? "supabase-logs";
  const endpoint = cfg.endpoint ?? "/api/public/sb3-upload";

  return {
    name,

    isEnabled() {
      return true;
    },

    ownsUrl(url) {
      return url.startsWith(PUBLIC_PREFIX);
    },

    async upload(file, filename, opts): Promise<UploadedMedia> {
      const contentType = (file.type || "image/webp").toLowerCase();
      if (!/^image\/(webp|png|jpe?g)$/.test(contentType)) {
        throw new Error("Kho ảnh Supabase #3 chỉ nhận WebP, PNG hoặc JPEG.");
      }

      let accessToken: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      } catch {
        /* ignore */
      }
      if (!accessToken) throw new Error("Cần đăng nhập để tải ảnh lên.");

      const folder = String(opts.folder || "images").replace(/^\/+|\/+$/g, "");
      const query = `?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`;

      opts.onProgress?.(10);
      const res = await fetch(`${endpoint}${query}`, {
        method: "POST",
        headers: {
          "content-type": contentType,
          Authorization: `Bearer ${accessToken}`,
        },
        body: file,
        signal: opts.signal,
      });
      if (!res.ok) {
        let detail = "";
        try {
          const err = (await res.json()) as { error?: string; detail?: string };
          detail = err?.detail || err?.error || "";
        } catch {
          /* ignore */
        }
        throw new Error(
          `Tải ảnh lên Supabase #3 thất bại (${res.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const out = (await res.json()) as { key: string; publicUrl: string; bytes?: number };
      opts.onProgress?.(100);

      return {
        provider: name,
        publicId: `${SB3_BUCKET}/${out.key}`,
        secureUrl: out.publicUrl,
        resourceType: "image",
        bytes: out.bytes ?? (file as File).size ?? 0,
        createdAt: new Date().toISOString(),
      };
    },

    buildUrl(url) {
      return url;
    },

    buildThumb(url, width) {
      if (!url.includes("/storage/v1/object/public/")) return url;
      const rendered = url.replace("/object/public/", "/render/image/public/");
      return `${rendered}?width=${Math.round(width)}&resize=contain&quality=80&format=webp`;
    },
  };
}
