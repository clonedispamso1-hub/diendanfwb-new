/**
 * Kho GIF dùng chung — lưu trữ trên Cloudinary (folder `FWB/GIF`).
 *
 * Nguyên tắc:
 *  - Chỉ Admin upload file, và file đi thẳng lên Cloudinary (KHÔNG dùng
 *    Supabase Storage, không bucket, không lưu binary/base64 trong DB).
 *  - Bảng `gif_library` chỉ lưu URL Cloudinary + metadata (kind, label, keywords).
 *  - Người dùng KHÔNG bao giờ upload lại: khi gửi GIF/sticker/icon họ chỉ
 *    tham chiếu tới URL đã có trong `gif_library`.
 *  - Dedupe theo SHA-256 nội dung file: cùng một file upload lại sẽ dùng lại
 *    URL cũ (cache lưu ở localStorage của máy admin).
 */
import { createCloudinaryProvider } from "@/lib/media/providers/cloudinary";
import { GifAdminOnlyError } from "@/lib/media/media-service";

export { GifAdminOnlyError };

/** Folder cố định cho toàn bộ Kho GIF / Sticker. */
export const GIF_FOLDER = "FWB/GIF";

const cloudinary = createCloudinaryProvider({ name: "cloudinary" });


const HASH_CACHE_KEY = "gif-library:hash-map";

type HashMap = Record<string, string>;

export type GifUploadResult = { url: string; file: File; sha256: string };
export type GifUploadFailure = { file: File; error: string };

function readHashMap(): HashMap {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(HASH_CACHE_KEY) || "{}") as HashMap;
  } catch {
    return {};
  }
}

function writeHashMap(map: HashMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HASH_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* quota — bỏ qua */
  }
}

async function sha256Hex(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeName(file: File): string {
  const base = (file.name || "gif").replace(/[^\w.\-]+/g, "_").slice(-60);
  return base.includes(".") ? base : `${base}.gif`;
}

/**
 * Upload 1 file lên Cloudinary (folder FWB/GIF). Nếu cùng nội dung đã upload
 * trước đó, KHÔNG upload lại — trả về URL cũ.
 */
export async function uploadGifToStorage(
  file: File,
  opts: { isAdmin: boolean },
): Promise<{ url: string; sha256: string }> {
  // Chỉ Admin được upload GIF mới lên Cloudinary (kho dùng chung).
  if (!opts?.isAdmin) throw new GifAdminOnlyError();
  let hash = "";
  try {
    hash = await sha256Hex(file);
  } catch (err) {
    console.warn("[gif-upload] sha256 failed, sẽ upload thẳng:", err);
  }

  const map = readHashMap();
  if (hash && map[hash]) {
    console.info("[gif-upload] dedupe hit", { name: file.name, sha256: hash, url: map[hash] });
    return { url: map[hash], sha256: hash };
  }

  console.info("[gif-upload] POST Cloudinary", {
    name: file.name,
    type: file.type || "(unknown)",
    size: file.size,
    sha256: hash,
    folder: GIF_FOLDER,
  });

  const uploaded = await cloudinary.upload(file, safeName(file), {
    kind: "title",
    folder: GIF_FOLDER,
    compress: false,
  } as any);
  const url = uploaded.secureUrl;
  console.info("[gif-upload] Cloudinary OK", { name: file.name, url });


  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`Máy chủ ảnh trả về URL không hợp lệ: ${String(url).slice(0, 200)}`);
  }

  if (hash) {
    map[hash] = url;
    writeHashMap(map);
  }
  return { url, sha256: hash };
}

/**
 * Upload nhiều file, có báo tiến trình.
 * Trả về cả danh sách thành công lẫn danh sách lỗi kèm nguyên nhân thật.
 */
export async function uploadGifsToStorage(
  files: File[],
  opts: { isAdmin: boolean },
  onProgress?: (percent: number) => void,
): Promise<{ ok: GifUploadResult[]; failed: GifUploadFailure[] }> {
  const ok: GifUploadResult[] = [];
  const failed: GifUploadFailure[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { url, sha256 } = await uploadGifToStorage(file, opts);
      ok.push({ url, file, sha256 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[gif-upload] FAILED", {
        name: file.name,
        type: file.type,
        size: file.size,
        error: message,
        exception: err,
      });
      failed.push({ file, error: message });
    }
    onProgress?.(Math.round(((i + 1) / files.length) * 100));
  }

  return { ok, failed };
}
