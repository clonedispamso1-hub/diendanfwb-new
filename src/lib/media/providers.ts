import type { MediaProvider } from "./types";
import { createCloudinaryProvider } from "./providers/cloudinary";
import { createSupabaseMediaProvider } from "./providers/supabase-media";

/**
 * Provider registry — kiến trúc nhiều provider.
 *
 *   StorageProvider → Supabase Media #2 (mặc định khi đã cấu hình)
 *                   → Cloudinary (fallback khi Supabase #2 chưa cấu hình)
 *
 * Sau này nếu Supabase #2 đầy dung lượng: chỉ cần trỏ env sang Supabase #3
 * (hoặc thêm provider mới ở file này). Toàn bộ website không phải sửa gì.
 */
export const supabaseMediaProvider: MediaProvider = createSupabaseMediaProvider({
  name: "supabase-media",
});

export const cloudinaryProvider: MediaProvider = createCloudinaryProvider({ name: "cloudinary" });

/** Provider đang được dùng để upload. */
export function activeProvider(): MediaProvider {
  return supabaseMediaProvider.isEnabled() ? supabaseMediaProvider : cloudinaryProvider;
}

/** Dùng để nhận diện URL (buildUrl / buildThumb) — kể cả URL cũ của Cloudinary. */
export const providers: MediaProvider[] = [supabaseMediaProvider, cloudinaryProvider];
