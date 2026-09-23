import type { MediaProvider } from "./types";
import { createCloudinaryProvider } from "./providers/cloudinary";
import { createR2Provider } from "./providers/r2";
import { createSupabaseMediaProvider } from "./providers/supabase-media";
import { createSupabasePrimaryProvider } from "./providers/supabase-primary";
import { createSupabaseLogsProvider } from "./providers/supabase-logs";

/**
 * Provider registry — kiến trúc nhiều provider.
 *
 *   StorageProvider → Cloudflare R2 (MẶC ĐỊNH cho mọi upload mới)
 *                   → Supabase Media #2 / Cloudinary (chỉ ĐỌC URL cũ)
 *
 * Từ 2026-09: toàn bộ file mới (avatar, bài đăng, clone, Live Móc, Feedback,
 * VIP assets, GIF) upload thẳng lên Cloudflare R2. Không ghi file vật lý lên
 * Supabase Storage nữa để tiết kiệm dung lượng và băng thông.
 */
export const r2Provider: MediaProvider = createR2Provider({ name: "cloudflare-r2" });

/** Chỉ đọc — media cũ đã nằm trên Supabase #2. */
export const supabaseMediaProvider: MediaProvider = createSupabaseMediaProvider({
  name: "supabase-media",
});

/** Chỉ đọc — nhận diện media cũ nằm trong Storage của Supabase #1. */
export const supabasePrimaryProvider: MediaProvider = createSupabasePrimaryProvider({
  name: "supabase-primary",
});

/** Chỉ đọc — media cũ đã nằm trên Cloudinary. */
export const cloudinaryProvider: MediaProvider = createCloudinaryProvider({ name: "cloudinary" });

/**
 * Supabase #3 — bucket sẵn có `feedback`. Dùng cho ảnh Feedback + thumbnail
 * Live Móc (ảnh nhỏ, đã nén dưới ~60KB). Ghi qua endpoint server.
 */
export const supabaseLogsProvider: MediaProvider = createSupabaseLogsProvider({
  name: "supabase-logs",
});

/** Provider đang được dùng để upload — luôn là Cloudflare R2. */
export function activeProvider(): MediaProvider {
  return r2Provider;
}

/** Dùng để nhận diện URL (buildUrl / buildThumb) — kể cả URL cũ. */
export const providers: MediaProvider[] = [
  r2Provider,
  supabaseLogsProvider,
  supabaseMediaProvider,
  cloudinaryProvider,
  supabasePrimaryProvider,
];
