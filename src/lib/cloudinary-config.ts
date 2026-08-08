/**
 * Cấu hình Cloudinary dùng chung cho toàn app (Kho GIF chung, Quản Lý Icon VIP).
 *
 * Ưu tiên biến môi trường `VITE_CLOUDINARY_*`; nếu thiếu thì dùng giá trị
 * fallback hardcode bên dưới để chức năng Upload không bao giờ "chết lặng".
 *
 * LƯU Ý BẢO MẬT: chỉ Cloud name / API key / Upload preset (unsigned) được để ở
 * client. API Secret chỉ nằm ở server (env `CLOUDINARY_API_SECRET`).
 */

/** Cloud name của tài khoản Cloudinary đang dùng. */
export const CLOUDINARY_CLOUD_NAME_FALLBACK = "vdpeovso";

/** API key (public, không phải secret). */
export const CLOUDINARY_API_KEY_FALLBACK = "";

/**
 * Danh sách Upload Preset (unsigned) sẽ thử lần lượt.
 * `gif_library` là preset unsigned đang tồn tại trên tài khoản Cloudinary.
 */
export const CLOUDINARY_PRESET_FALLBACKS = ["gif_library"] as const;

function env(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  const s = (v ?? "").trim().replace(/^["']|["']$/g, "");
  return s || undefined;
}

export function getCloudinaryCloudName(): string {
  return env("VITE_CLOUDINARY_CLOUD_NAME") || CLOUDINARY_CLOUD_NAME_FALLBACK;
}

export function getCloudinaryApiKey(): string {
  return env("VITE_CLOUDINARY_API_KEY") || CLOUDINARY_API_KEY_FALLBACK;
}

/** Preset ưu tiên (env) + các preset dự phòng, đã loại trùng. */
export function getCloudinaryUploadPresets(): string[] {
  const preferred = env("VITE_CLOUDINARY_UPLOAD_PRESET");
  return Array.from(new Set([preferred, ...CLOUDINARY_PRESET_FALLBACKS].filter(Boolean) as string[]));
}

/** https://api.cloudinary.com/v1_1/<cloud_name>/<resource_type>/upload */
export function getCloudinaryUploadEndpoint(resourceType: "image" | "video" | "raw" | "auto" = "image"): string {
  return `https://api.cloudinary.com/v1_1/${getCloudinaryCloudName()}/${resourceType}/upload`;
}
