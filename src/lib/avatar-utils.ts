import {
  avatarSrc,
  disableStorageTransform,
  isStorageTransformUrl,
  storageOriginalUrl,
} from "@/lib/image-cdn";

/**
 * Avatar URL helpers.
 * - Chuẩn hoá đường dẫn lưu trong DB (có thể chỉ là path tương đối trong Supabase Storage).
 * - Trả về fallback gradient tối giản khi URL rỗng / placeholder / load lỗi.
 */
const SUPABASE_STORAGE_BASE =
  "https://zbuwddjcqdlyijcunwgd.supabase.co/storage/v1/object/public/avatars/";

/** Gradient SVG nhỏ, inline để không cần thêm 1 request mạng nào. */
export const FALLBACK_AVATAR_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
       <defs>
         <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
           <stop offset='0%' stop-color='#8b5cf6'/>
           <stop offset='100%' stop-color='#ec4899'/>
         </linearGradient>
       </defs>
       <rect width='64' height='64' rx='32' fill='url(#g)'/>
       <circle cx='32' cy='26' r='11' fill='rgba(255,255,255,0.85)'/>
       <path d='M12 58c2-11 11-17 20-17s18 6 20 17z' fill='rgba(255,255,255,0.85)'/>
     </svg>`,
  );

/**
 * Chuẩn hoá URL avatar VÀ tự động thu nhỏ qua CDN (Cloudinary transformation
 * hoặc Supabase Storage render/image). Chỉ 2 biến thể được cache: 64px cho
 * danh sách/feed và 320px (khớp file gốc đã lưu) cho Profile → Egress thấp
 * nhất, không sinh thêm request lặp lại.
 *
 * @param size kích thước hiển thị theo CSS px (mặc định 48 → biến thể 64px).
 */
export function getValidAvatarUrl(url?: string | null, size = 48): string {
  if (!url) return FALLBACK_AVATAR_DATA_URL;
  const s = String(url).trim();
  if (!s) return FALLBACK_AVATAR_DATA_URL;
  const lower = s.toLowerCase();
  if (lower === "placeholder.svg" || lower.endsWith("/placeholder.svg")) {
    return FALLBACK_AVATAR_DATA_URL;
  }
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return s;

  let abs: string;
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    abs = s;
  } else if (s.startsWith("/")) {
    // Local bundled asset (vd: /assets/...) — không đụng tới.
    return s;
  } else {
    // Còn lại — coi như path trong Supabase Storage bucket "avatars".
    abs = SUPABASE_STORAGE_BASE + s.replace(/^\/+/, "");
  }

  // SVG/GIF giữ nguyên (không transform). Mọi ảnh raster khác — kể cả file
  // KHÔNG có đuôi mở rộng — vẫn đi qua render/image để lấy bản WebP thu nhỏ.
  if (/\.(svg|gif)(\?|$)/i.test(abs)) return abs;
  return avatarSrc(abs, size);
}

/** Dùng cho prop onError của <img loading="lazy" decoding="async">. */
export function handleAvatarError(
  e: React.SyntheticEvent<HTMLImageElement>,
) {
  const img = e.currentTarget;
  if (isStorageTransformUrl(img.src)) {
    // Project chưa bật Image Transformation → quay lại ảnh gốc, tắt cho cả phiên.
    disableStorageTransform();
    img.src = storageOriginalUrl(img.src);
    return;
  }
  if (img.src === FALLBACK_AVATAR_DATA_URL) return;
  img.onerror = null;
  img.src = FALLBACK_AVATAR_DATA_URL;
}
