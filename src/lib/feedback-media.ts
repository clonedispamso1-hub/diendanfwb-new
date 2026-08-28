/**
 * Upload ảnh Feedback lên Supabase Storage #2 (bucket "media").
 * Không dùng Cloudinary.
 *
 * Tối ưu Cached Egress:
 *  - Resize + nén WebP NGAY TẠI TRÌNH DUYỆT trước khi upload.
 *  - Sinh 2 phiên bản: thumbnail 480px (danh sách) + detail 720px (chi tiết).
 *  - BẮT BUỘC: mỗi file < 50KB (tự hạ quality → hạ kích thước tới khi đạt).
 */
import { db2, isSecondaryConfigured } from "@/lib/db/router";

/** Bucket media của Supabase #2. */
export const FEEDBACK_BUCKET = "media";
/** Thư mục con trong bucket. */
export const FEEDBACK_FOLDER = "feedback";
/** Ngưỡng dung lượng tối đa mỗi ảnh (siêu nhẹ). */
export const MAX_IMAGE_BYTES = 50 * 1024;

async function loadBitmap(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Không đọc được ảnh"));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

async function toWebp(img: HTMLImageElement, maxW: number, quality = 0.65): Promise<Blob> {
  const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
  const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas không khả dụng");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob((b) => res(b), "image/webp", quality),
  );
  if (!blob) throw new Error("Không nén được ảnh");
  return blob;
}

/**
 * Nén WebP xuống DƯỚI 50KB: giảm dần quality, nếu vẫn nặng thì thu nhỏ chiều rộng.
 */
async function toWebpUnderLimit(
  img: HTMLImageElement,
  maxW: number,
  limit = MAX_IMAGE_BYTES,
): Promise<Blob> {
  let width = maxW;
  let best: Blob | null = null;

  for (let step = 0; step < 5; step++) {
    for (const q of [0.7, 0.6, 0.5, 0.4, 0.32, 0.25]) {
      const blob = await toWebp(img, width, q);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= limit) return blob;
    }
    width = Math.max(160, Math.round(width * 0.75));
  }
  if (!best) throw new Error("Không nén được ảnh");
  return best;
}

export interface UploadedFeedbackImage {
  imageUrl: string; // 720px
  thumbUrl: string; // 480px
}

export async function uploadFeedbackImage(file: File): Promise<UploadedFeedbackImage> {
  if (!isSecondaryConfigured) {
    throw new Error("Chưa cấu hình Supabase #2 (VITE_MEDIA_SUPABASE_URL / ANON_KEY).");
  }
  const img = await loadBitmap(file);
  const full = await toWebpUnderLimit(img, 720);
  const thumb = await toWebpUnderLimit(img, 480);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `${FEEDBACK_FOLDER}/${stamp}`;
  const client = db2();

  const put = async (path: string, blob: Blob) => {
    const { error } = await client.storage
      .from(FEEDBACK_BUCKET)
      .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (error) throw error;
    return client.storage.from(FEEDBACK_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const imageUrl = await put(`${base}-720.webp`, full);
  const thumbUrl = await put(`${base}-480.webp`, thumb);
  return { imageUrl, thumbUrl };
}
