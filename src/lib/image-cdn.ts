/**
 * image-cdn — sinh URL ảnh đã resize/nén để giảm Egress.
 *
 * Chỉ biến đổi những URL CHẮC CHẮN hỗ trợ (Cloudinary). Các URL khác giữ
 * nguyên để không bao giờ làm vỡ ảnh. Không đổi Supabase URL / API key.
 */

const CLOUDINARY_RE = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload\/)(.*)$/i;

export interface ResizeOptions {
  /** Chiều rộng mong muốn (px, theo CSS). */
  width: number;
  /** Chiều cao; mặc định = width (avatar vuông). */
  height?: number;
  /** c_fill (cắt vừa khung) hay c_limit (giữ tỉ lệ, không phóng to). */
  crop?: "fill" | "limit";
  /** Nhân theo devicePixelRatio (tối đa 2). */
  dpr?: boolean;
}

function dprFactor(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
}

/** Trả về URL đã resize nếu provider hỗ trợ, ngược lại trả nguyên URL. */
export function cdnResize(url: string | null | undefined, opts: ResizeOptions): string {
  const src = (url || "").trim();
  if (!src) return src;
  const m = CLOUDINARY_RE.exec(src);
  if (!m) return src;

  const [, base, rest] = m;
  // Không chồng transformation nếu URL đã có sẵn.
  if (/^(?:[a-z]{1,3}_[^/]+,)*[a-z]{1,3}_[^/]+\//.test(rest) && /\b[wh]_\d+/.test(rest)) return src;

  const k = opts.dpr === false ? 1 : dprFactor();
  const w = Math.round(opts.width * k);
  const h = Math.round((opts.height ?? opts.width) * k);
  const crop = opts.crop ?? "fill";
  const tx =
    crop === "limit"
      ? `f_auto,q_auto,w_${w},c_limit`
      : `f_auto,q_auto,w_${w},h_${h},c_fill,g_auto`;
  return `${base}${tx}/${rest}`;
}

/** Bậc kích thước avatar chuẩn: 64 / 128 / 256px. */
export function avatarTier(cssSize: number): 64 | 128 | 256 {
  if (cssSize <= 32) return 64;
  if (cssSize <= 72) return 128;
  return 256;
}

/** Kích thước avatar chuẩn: nhỏ 64px, feed 128px, trang cá nhân 256px. */
export function avatarVariant(url: string | null | undefined, cssSize: number): string {
  return cdnResize(url, { width: avatarTier(cssSize), crop: "fill", dpr: false });
}

/** Thumbnail cho ảnh trong feed (không bao giờ tải bản gốc). */
export function feedThumb(url: string | null | undefined, width = 720): string {
  const src = (url || "").trim();
  if (!src) return src;
  if (CLOUDINARY_RE.test(src)) return cdnResize(src, { width, crop: "limit" });
  return supabaseThumb(src, width);
}



/* ============================================================
 * Supabase Storage — dùng endpoint render/image để lấy bản đã resize.
 * Nếu project chưa bật Image Transformation, URL này sẽ lỗi → UserAvatar
 * tự fallback về URL gốc và tắt transform cho toàn phiên (không lặp lỗi).
 * ============================================================ */

const SB_PUBLIC_RE = /^(https?:\/\/[^/]+\/storage\/v1)\/object\/public\/(.+)$/i;

let sbTransformDisabled = false;

/** Tắt transform cho toàn phiên khi endpoint render không khả dụng. */
export function disableStorageTransform() {
  sbTransformDisabled = true;
}

/** Transform của Supabase Storage có đang bị tắt cho phiên này không. */
export function storageTransformDisabled(): boolean {
  return sbTransformDisabled;
}

/** Thumbnail giữ tỉ lệ cho ảnh nội dung nằm trong Supabase Storage. */
export function supabaseThumb(url: string, width: number, quality = 70): string {
  if (sbTransformDisabled) return url;
  if (/\.gif($|\?)/i.test(url)) return url;
  const m = SB_PUBLIC_RE.exec(url);
  if (!m) return url;
  const [, base, rest] = m;
  return `${base}/render/image/public/${rest}?width=${Math.round(width)}&resize=contain&quality=${quality}`;
}



export function isStorageTransformUrl(url: string | null | undefined): boolean {
  return Boolean(url && /\/storage\/v1\/render\/image\/public\//i.test(url));
}

/** URL gốc (object/public) từ một URL render/image. */
export function storageOriginalUrl(url: string): string {
  return url
    .replace("/storage/v1/render/image/public/", "/storage/v1/object/public/")
    .replace(/[?&](width|height|quality|resize)=[^&]*/g, "")
    .replace(/\?$/, "");
}

function supabaseResize(url: string, width: number, height: number, quality = 70): string {
  if (sbTransformDisabled) return url;
  const m = SB_PUBLIC_RE.exec(url);
  if (!m) return url;
  const [, base, rest] = m;
  return `${base}/render/image/public/${rest}?width=${width}&height=${height}&resize=cover&quality=${quality}`;
}

/**
 * Ảnh đại diện tối ưu: Cloudinary → transformation, Supabase Storage →
 * render/image, còn lại giữ nguyên.
 */
export function avatarSrc(url: string | null | undefined, cssSize: number): string {
  const src = (url || "").trim();
  if (!src) return src;
  if (CLOUDINARY_RE.test(src)) return avatarVariant(src, cssSize);
  const px = avatarTier(cssSize);
  return supabaseResize(src, px, px);

}
