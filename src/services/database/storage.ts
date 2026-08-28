/**
 * STORAGE (Supabase 2 + Cloudinary) — mọi upload file đi qua MediaService:
 * ảnh được nén (ưu tiên WebP) trước khi upload; GIF/Sticker/CDN đi Cloudinary.
 *
 * Không component nào được gọi `supabase.storage` hay Cloudinary trực tiếp.
 */
import { db2, isSecondaryConfigured } from "@/lib/db/router";
import {
  uploadMedia,
  uploadMediaUrl,
  deleteMedia,
  getMediaUrl,
  type UploadOptions,
  type UploadedMedia,
} from "@/lib/media";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Client Supabase 2 (chỉ dùng cho storage / dữ liệu phụ). */
export const storageDb = (): SupabaseClient<any> => db2() as SupabaseClient<any>;
export const isStorageConfigured = isSecondaryConfigured;

export const storage = {
  upload: (file: File, options: UploadOptions): Promise<UploadedMedia> => uploadMedia(file, options),
  uploadUrl: (file: File, options: UploadOptions): Promise<string> => uploadMediaUrl(file, options),
  remove: deleteMedia,
  url: getMediaUrl,
  client: storageDb,
};
