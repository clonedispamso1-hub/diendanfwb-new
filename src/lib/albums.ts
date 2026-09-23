/**
 * ALBUM — dữ liệu lưu trên SUPABASE #4 (không dùng R2, không dùng Supabase cũ):
 *   - bảng `public.albums`
 *   - bucket công khai `album-covers` (1 ảnh cover / album)
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-21_albums.sql
 *
 * Tài khoản thứ hai (Supabase #1) chỉ được THAM CHIẾU để đứng tên Album —
 * không lấy/copy bài viết của tài khoản đó.
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";

export const ALBUMS_TABLE = "albums";
export const ALBUM_COVERS_BUCKET = "album-covers";

export interface Album {
  id: string;
  owner_id: string;
  owner_username: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
  title: string;
  cover_url: string | null;
  view_count: number;
  photo_count: number;
  video_count: number;
  price: number;
  fake_purchase_count: number;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface AlbumInput {
  owner_id: string;
  owner_username?: string | null;
  owner_name?: string | null;
  owner_avatar?: string | null;
  title: string;
  cover_url?: string | null;
  view_count: number;
  photo_count: number;
  video_count: number;
  price?: number;
  fake_purchase_count?: number;
  enabled?: boolean;
}

/** 1000 → "1K", 1500 → "1.5K", 10000 → "10K", 1000000 → "1M". */
export function formatDisplayCount(n: number): string {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 1000) return String(v);
  const unit = (x: number, suffix: string) => {
    const r = x >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
    return `${String(r).replace(/\.0$/, "")}${suffix}`;
  };
  if (v < 1_000_000) return unit(v / 1000, "K");
  if (v < 1_000_000_000) return unit(v / 1_000_000, "M");
  return unit(v / 1_000_000_000, "B");
}

/** 20000 → "20,000" (dấu phẩy hàng nghìn, luôn là số nguyên). */
export function formatThousands(n: number | string): string {
  const digits = String(n ?? "").replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Cột price / fake_purchase_count có thể chưa tồn tại trên Supabase #4. */
const OPTIONAL_COLUMNS = ["price", "fake_purchase_count"] as const;

function isMissingColumn(error: any): boolean {
  const msg = String(error?.message || "");
  return OPTIONAL_COLUMNS.some((c) => msg.includes(c)) && /column|schema cache/i.test(msg);
}

function withoutOptionalColumns<T extends Record<string, any>>(payload: T): T {
  const copy: Record<string, any> = { ...payload };
  for (const c of OPTIONAL_COLUMNS) delete copy[c];
  return copy as T;
}

function normalize(r: any): Album {
  return {
    id: String(r.id),
    owner_id: String(r.owner_id ?? ""),
    owner_username: r.owner_username ?? null,
    owner_name: r.owner_name ?? null,
    owner_avatar: r.owner_avatar ?? null,
    title: String(r.title ?? ""),
    cover_url: r.cover_url ?? null,
    view_count: Number(r.view_count) || 0,
    photo_count: Number(r.photo_count) || 0,
    video_count: Number(r.video_count) || 0,
    price: Math.max(0, Math.floor(Number(r.price) || 0)),
    fake_purchase_count: Math.max(0, Math.floor(Number(r.fake_purchase_count) || 0)),
    enabled: r.enabled !== false,
    sort_order: Number(r.sort_order) || 0,
    created_at: String(r.created_at ?? ""),
  };
}

/** Danh sách Album cho Admin (kể cả album đang tắt). */
export async function listAlbumsAdmin(): Promise<Album[]> {
  const { data, error } = await sb4Admin()
    .from(ALBUMS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalize);
}

/** Danh sách Album hiển thị ở tab "Album" ngoài Frontend. */
export async function listAlbumsPublic(): Promise<Album[]> {
  const { data, error } = await sb4()
    .from(ALBUMS_TABLE)
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalize);
}

export async function createAlbum(input: AlbumInput): Promise<Album> {
  const body = { ...input, enabled: input.enabled !== false };
  const res = await sb4Admin().from(ALBUMS_TABLE).insert(body).select("*").single();
  if (res.error) {
    if (!isMissingColumn(res.error)) throw res.error;
    const retry = await sb4Admin()
      .from(ALBUMS_TABLE)
      .insert(withoutOptionalColumns(body))
      .select("*")
      .single();
    if (retry.error) throw retry.error;
    return normalize(retry.data);
  }
  return normalize(res.data);
}

export async function updateAlbum(id: string, patch: Partial<AlbumInput>): Promise<void> {
  const { error } = await sb4Admin().from(ALBUMS_TABLE).update(patch).eq("id", id);
  if (!error) return;
  if (!isMissingColumn(error)) throw error;
  const retry = await sb4Admin()
    .from(ALBUMS_TABLE)
    .update(withoutOptionalColumns(patch))
    .eq("id", id);
  if (retry.error) throw retry.error;
}

export async function setAlbumEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await sb4Admin().from(ALBUMS_TABLE).update({ enabled }).eq("id", id);
  if (error) throw error;
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await sb4Admin().from(ALBUMS_TABLE).delete().eq("id", id);
  if (error) throw error;
}

const ALBUM_COVER_MAX_EDGE = 1280;
const ALBUM_COVER_TARGET_BYTES = 300 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadAlbumCover(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("Trình duyệt không hỗ trợ xử lý ảnh trước khi tải lên");
  }
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/**
 * Nén cover ngay trên thiết bị. File gốc không bao giờ được đưa lên Storage.
 * Ưu tiên WebP dưới 300KB; ảnh lớn sẽ tiếp tục hạ quality và kích thước.
 */
export async function compressAlbumCover(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ nhận tệp ảnh");

  const bitmap = await loadAlbumCover(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, ALBUM_COVER_MAX_EDGE / Math.max(1, longest));
    let best: Blob | null = null;
    let outputType = "image/webp";

    for (let resizeStep = 0; resizeStep < 4; resizeStep++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Không thể xử lý ảnh cover");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        let blob = await canvasBlob(canvas, "image/webp", quality);
        if (!blob) {
          outputType = "image/jpeg";
          blob = await canvasBlob(canvas, outputType, quality);
        }
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= ALBUM_COVER_TARGET_BYTES) {
          const extension = outputType === "image/webp" ? "webp" : "jpg";
          return new File([blob], `album-cover-${Date.now()}.${extension}`, { type: outputType });
        }
      }
      scale *= 0.82;
    }

    if (!best) throw new Error("Không thể nén ảnh cover");
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    return new File([best], `album-cover-${Date.now()}.${extension}`, { type: outputType });
  } finally {
    bitmap.close();
  }
}

/** Upload 1 ảnh cover đã nén lên bucket công khai `album-covers` của Supabase #4. */
export async function uploadAlbumCover(file: File): Promise<string> {
  const client = sb4Admin();
  const compressed = await compressAlbumCover(file);
  const ext = (compressed.name.split(".").pop() || "webp").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;
  const up = await client.storage.from(ALBUM_COVERS_BUCKET).upload(key, compressed, {
    cacheControl: "31536000",
    upsert: false,
    contentType: compressed.type,
  });
  if (up.error) throw up.error;
  const { data } = client.storage.from(ALBUM_COVERS_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}
