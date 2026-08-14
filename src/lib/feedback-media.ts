/**
 * Upload ảnh Feedback lên Supabase Storage #2 (bucket "feedback-media").
 * Không dùng Cloudinary.
 *
 * Tối ưu Cached Egress:
 *  - Resize + nén WebP NGAY TẠI TRÌNH DUYỆT trước khi upload.
 *  - Sinh 2 phiên bản: thumbnail 480px (danh sách) + detail 720px (chi tiết).
 *  - Quality 0.65 (~60–70).
 */
import { db2, isSecondaryConfigured } from "@/integrations/supabase/secondary-client";

export const FEEDBACK_BUCKET = "feedback-media";

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

export interface UploadedFeedbackImage {
  imageUrl: string; // 720px
  thumbUrl: string; // 480px
}

export async function uploadFeedbackImage(file: File): Promise<UploadedFeedbackImage> {
  if (!isSecondaryConfigured) {
    throw new Error("Chưa cấu hình Supabase #2 (VITE_MEDIA_SUPABASE_URL / ANON_KEY).");
  }
  const img = await loadBitmap(file);
  const [full, thumb] = await Promise.all([toWebp(img, 720, 0.68), toWebp(img, 480, 0.62)]);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `fb/${stamp}`;
  const client = db2();

  const put = async (path: string, blob: Blob) => {
    const { error } = await client.storage
      .from(FEEDBACK_BUCKET)
      .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (error) throw error;
    return client.storage.from(FEEDBACK_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const [imageUrl, thumbUrl] = await Promise.all([
    put(`${base}-720.webp`, full),
    put(`${base}-480.webp`, thumb),
  ]);
  return { imageUrl, thumbUrl };
}
