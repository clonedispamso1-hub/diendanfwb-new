/**
 * MediaService — điểm truy cập DUY NHẤT cho toàn bộ upload media.
 *
 * Toàn bộ Avatar / Ảnh hồ sơ / Banner / Ảnh bài viết / Video bài viết /
 * Ảnh bình luận / Ảnh chat / Video chat / Story / Album đều đi qua đây.
 *
 * Kiến trúc:
 *
 *   Component → uploadMedia() → MediaService → Cloudinary
 *
 * Sau này đổi nhà cung cấp → chỉ sửa `providers.ts`. Component không đổi.
 */

import imageCompression from "browser-image-compression";
import type {
  MediaKind,
  MediaProvider,
  UploadOptions,
  UploadedMedia,
} from "./types";
import { providers, activeProvider, supabaseMediaProvider } from "./providers";

export type { MediaKind, UploadOptions, UploadedMedia } from "./types";

const FOLDER_BY_KIND: Record<MediaKind, { image: string; video: string }> = {
  avatar:       { image: "avatars",           video: "avatars_video" },
  banner:       { image: "banners",           video: "banners_video" },
  gallery:      { image: "profile_images",    video: "profile_videos" },
  post:         { image: "post_images",       video: "post_videos" },
  video:        { image: "post_images",       video: "post_videos" },
  comment:      { image: "comment_images",    video: "comment_videos" },
  chat:         { image: "chat_images",       video: "chat_videos" },
  story:        { image: "stories",           video: "stories" },
  featured:     { image: "featured-moments",  video: "featured-moments" },
  title:        { image: "FWB/GIF",           video: "FWB/GIF" },
  verification: { image: "verification",      video: "verification" },
  other:        { image: "candy",             video: "candy" },
};

function resolveFolder(kind: MediaKind, file: File | Blob, override?: string): string {
  if (override) return override;
  const isVideo = (file.type || "").toLowerCase().startsWith("video/");
  const entry = FOLDER_BY_KIND[kind] ?? FOLDER_BY_KIND.other;
  return isVideo ? entry.video : entry.image;
}

function isImage(file: File | Blob): boolean {
  return (file.type || "").toLowerCase().startsWith("image/");
}

/**
 * Các nhóm media chỉ chấp nhận ảnh (KHÔNG video). Áp dụng cho bài viết,
 * avatar, chat, banner, gallery, comment. Video-only kinds như "video" hoặc
 * "story"/"featured" (đang hỗ trợ video ngắn) không nằm trong danh sách này.
 */
const IMAGE_ONLY_KINDS: ReadonlySet<MediaKind> = new Set<MediaKind>([
  "avatar",
  "post",
  "chat",
  "banner",
  "gallery",
  "comment",
]);

export class MediaImageOnlyError extends Error {
  code = "MEDIA_IMAGE_ONLY" as const;
  constructor(message = "Hệ thống hiện tại chỉ hỗ trợ đăng tải hình ảnh.") {
    super(message);
    this.name = "MediaImageOnlyError";
  }
}

/** Avatar chỉ chấp nhận JPG / PNG / WEBP (không GIF, APNG, SVG, video). */
export const AVATAR_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
export const AVATAR_ONLY_MESSAGE =
  "Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WEBP.";
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export class AvatarFormatError extends Error {
  code = "AVATAR_FORMAT_NOT_ALLOWED" as const;
  constructor(message = AVATAR_ONLY_MESSAGE) {
    super(message);
    this.name = "AvatarFormatError";
  }
}

/** true nếu file hợp lệ để làm ảnh đại diện. */
export function isAllowedAvatarFile(file: File | Blob): boolean {
  const t = (file.type || "").toLowerCase();
  const name = ((file as File).name || "").toLowerCase();
  if (t) return AVATAR_ALLOWED_TYPES.has(t);
  return /\.(jpe?g|png|webp)$/.test(name);
}

function assertAvatarFormat(file: File | Blob): void {
  const name = ((file as File).name || "").toLowerCase();
  if (/\.(gif|apng|svg|bmp|tiff?|avif|heic|heif)$/.test(name)) throw new AvatarFormatError();
  if (!isAllowedAvatarFile(file)) throw new AvatarFormatError();
}

function assertKindAllows(file: File | Blob, kind: MediaKind): void {
  if (kind === "avatar") assertAvatarFormat(file);
  if (!IMAGE_ONLY_KINDS.has(kind)) return;
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) throw new MediaImageOnlyError();
  // Nếu MIME rỗng, fallback theo phần mở rộng.
  if (!t) {
    const name = ((file as File).name || "").toLowerCase();
    if (/\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(name)) {
      throw new MediaImageOnlyError();
    }
  }
}


async function maybeCompress(file: File | Blob, filename: string, opts: UploadOptions): Promise<File | Blob> {
  if (opts.compress === false) return file;
  if (!isImage(file)) return file;
  // Never compress animated GIFs — canvas re-encoding flattens to first frame.
  const t = (file.type || "").toLowerCase();
  const name = ((file as File).name || "").toLowerCase();
  // Media có alpha/animation: giữ nguyên bytes, không đưa qua canvas/re-encode.
  if (
    ["image/gif", "image/png", "image/webp", "image/apng", "image/svg+xml", "image/avif"].includes(t) ||
    /\.(gif|png|webp|apng|svg|avif)$/i.test(name) ||
    name.includes("sticker")
  ) return file;
  try {
    const asFile = file instanceof File ? file : new File([file], filename, { type: file.type });
    // Ưu tiên GIỮ CHẤT LƯỢNG:
    //  • Avatar : WebP cạnh dài ≤ 600px, quality ~0.92 (≤ 0.3MB).
    //  • Media  : WebP cạnh dài ≤ 1600px, quality ~0.85 (≤ 1MB).
    const isAvatar = opts.kind === "avatar";
    const compressed = await imageCompression(asFile, {
      maxSizeMB: opts.maxSizeMB ?? (isAvatar ? 0.3 : 1),
      maxWidthOrHeight: opts.maxWidthOrHeight ?? (isAvatar ? 600 : 1600),
      useWebWorker: true,
      initialQuality: isAvatar ? 0.92 : 0.85,
      fileType: "image/webp",
    });
    const webpName = filename.replace(/\.[^./\\]+$/, "") + ".webp";
    return new File([compressed], webpName, { type: "image/webp" });
  } catch (err) {
    console.warn("[MediaService] compression failed, uploading original", err);
    return file;
  }
}

/** true nếu file là GIF (theo MIME hoặc phần mở rộng). */
export function isGifFile(file: File | Blob): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/gif") return true;
  if (t) return false;
  return ((file as File).name || "").toLowerCase().endsWith(".gif");
}

/**
 * Phân luồng provider — TỪ 2026-09 mọi upload MỚI đều ghi thẳng Cloudflare R2.
 * Cloudinary / Supabase Storage chỉ còn dùng để ĐỌC URL cũ.
 */
function resolveProvider(_kind: MediaKind, _file: File | Blob): MediaProvider {
  return activeProvider();
}



/**
 * Upload media qua đúng MỘT provider (không fallback chain).
 */
export async function uploadMedia(
  file: File | Blob,
  opts: UploadOptions,
): Promise<UploadedMedia> {
  const filename = (file as File).name || `upload-${Date.now()}`;
  assertKindAllows(file, opts.kind);
  const folder = resolveFolder(opts.kind, file, opts.folder);
  const payload = await maybeCompress(file, filename, opts);

  const provider = resolveProvider(opts.kind, payload);
  if (!provider.isEnabled()) {
    throw new Error(`MediaService: provider "${provider.name}" đang tắt.`);
  }
  return provider.upload(payload, filename, { ...opts, folder });
}

/**
 * Avatar / ảnh hồ sơ — LUÔN Cloudinary, không bao giờ đi qua logic chặn bài viết,
 * luôn dùng Cloudinary.
 */
export async function uploadAvatar(
  file: File | Blob,
  opts: Omit<UploadOptions, "kind"> & { kind?: "avatar" | "gallery" | "banner" } = {},
): Promise<UploadedMedia> {
  return uploadMedia(file, { ...opts, kind: opts.kind ?? "avatar" });
}

/** Convenience: upload avatar/ảnh hồ sơ → trả về secure URL (luôn Cloudinary). */
export async function uploadAvatarUrl(
  file: File | Blob,
  opts: Omit<UploadOptions, "kind"> & { kind?: "avatar" | "gallery" | "banner" } = {},
): Promise<string> {
  const media = await uploadAvatar(file, opts);
  return media.secureUrl;
}

export class PostMediaNotAllowedError extends Error {
  code = "POST_MEDIA_NOT_ALLOWED" as const;
  constructor(
    message = "Tính năng đăng ảnh chưa được kích hoạt cho tài khoản của bạn. Vui lòng liên hệ Admin nếu cần sử dụng.",
  ) {
    super(message);
    this.name = "PostMediaNotAllowedError";
  }
}

/**
 * Ảnh bài viết — mọi thành viên đều được tải lên (bài viết chỉ hỗ trợ ảnh).
 * Thành viên thường: bài sẽ ở trạng thái "chờ Admin duyệt" (xử lý ở tầng đăng bài).
 * Thành viên VIP / Admin: hiển thị ngay.
 */
export async function uploadPostMedia(
  file: File | Blob,
  opts: Omit<UploadOptions, "kind"> & { kind?: "post"; isAdmin?: boolean },
): Promise<UploadedMedia> {
  const { isAdmin: _isAdmin, kind, ...rest } = opts;
  return uploadMedia(file, { ...rest, kind: kind ?? "post" });
}


/** Convenience: upload ảnh bài viết → trả về secure URL. */
export async function uploadPostMediaUrl(
  file: File | Blob,
  opts: Omit<UploadOptions, "kind"> & { kind?: "post"; isAdmin?: boolean },

): Promise<string> {
  const media = await uploadPostMedia(file, opts);
  return media.secureUrl;
}

export class CloneVideoNotAllowedError extends Error {
  code = "CLONE_VIDEO_NOT_ALLOWED" as const;
  constructor(message = "Tài khoản thứ hai không được phép tải video lên. Chỉ hỗ trợ ảnh.") {
    super(message);
    this.name = "CloneVideoNotAllowedError";
  }
}

function assertNotVideo(file: File | Blob): void {
  const t = (file.type || "").toLowerCase();
  const name = ((file as File).name || "").toLowerCase();
  if (t.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v|3gp|m3u8)$/i.test(name)) {
    if (t.startsWith("audio/")) return;
    throw new CloneVideoNotAllowedError();
  }
}

/**
 * Ảnh bài viết của "Tài khoản thứ hai" (clone) — LƯU VÀO SUPABASE #2
 * (bucket `media`, subfolder `posts`). Có nén nhẹ để tiết kiệm dung lượng
 * nhưng vẫn nhìn rõ. TUYỆT ĐỐI không gọi Cloudflare R2 và không nhận video.
 */
export async function uploadClonePostMediaUrl(file: File | Blob): Promise<string> {
  assertNotVideo(file);
  const filename = (file as File).name || `clone-post-${Date.now()}`;
  const kind: MediaKind = "post";
  assertKindAllows(file, kind);
  if (!supabaseMediaProvider.isEnabled()) {
    throw new Error("Kho ảnh (Supabase #2) chưa sẵn sàng — không thể tải ảnh Tài khoản thứ hai lên.");
  }
  const payload = await maybeCompress(file, filename, {
    kind,
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1280,
  });
  const uploaded = await supabaseMediaProvider.upload(payload, filename, { kind, folder: "posts" });
  return uploaded.secureUrl;
}

/**
 * Voice bài đăng của "Tài khoản thứ hai" — nén CỰC MẠNH (mono 16kHz, Opus
 * ~16kbps) rồi lưu vào Supabase #2. Không lưu bản gốc, không đi qua R2.
 */
export async function uploadCloneVoiceUrl(file: File | Blob): Promise<string> {
  const { compressVoiceStrong } = await import("@/lib/audio/voice-compress");
  const compressed = await compressVoiceStrong(file, `clone-voice-${Date.now()}`);
  if (!supabaseMediaProvider.isEnabled()) {
    throw new Error("Kho media (Supabase #2) chưa sẵn sàng — không thể lưu voice.");
  }
  const uploaded = await supabaseMediaProvider.upload(compressed, compressed.name, {
    kind: "other",
    compress: false,
  });
  return uploaded.secureUrl;
}

/**
 * Ảnh QR thanh toán (lệnh nạp) — lưu vào Supabase Storage của project hiện tại
 * (bucket `media`, subfolder `posts`). KHÔNG nén, KHÔNG resize: QR là dữ liệu
 * thanh toán nên phải giữ nguyên độ phân giải và độ nét.
 * Supabase Storage chưa cấu hình → fallback sang provider đang hoạt động.
 */
export async function uploadPaymentQrUrl(file: File | Blob): Promise<string> {
  const filename = (file as File).name || `payment-qr-${Date.now()}.png`;
  const opts: UploadOptions = { kind: "other", folder: "posts", compress: false };
  const provider = supabaseMediaProvider.isEnabled() ? supabaseMediaProvider : activeProvider();
  if (!provider.isEnabled()) {
    throw new Error("Kho ảnh chưa sẵn sàng — không thể lưu ảnh QR.");
  }
  const uploaded = await provider.upload(file, filename, opts);
  return uploaded.secureUrl;
}

export class GifAdminOnlyError extends Error {
  code = "GIF_UPLOAD_ADMIN_ONLY" as const;
  constructor(
    message = "Chỉ Admin mới được tải GIF lên kho dùng chung. Bạn hãy chọn GIF có sẵn trong thư viện.",
  ) {
    super(message);
    this.name = "GifAdminOnlyError";
  }
}

/**
 * Kho GIF / Sticker dùng chung — CHỈ Admin, upload lên Cloudinary (folder `FWB/GIF`).
 * Người dùng thường chỉ đọc URL từ bảng `gif_library`.
 */
export async function uploadGifLibrary(
  file: File | Blob,
  opts: Omit<UploadOptions, "kind"> & { isAdmin: boolean },
): Promise<UploadedMedia> {
  const { isAdmin, ...rest } = opts;
  if (!isAdmin) throw new GifAdminOnlyError();
  // GIF: không nén, không đổi định dạng.
  return uploadMedia(file, { ...rest, kind: "title", compress: false });
}

/**
 * Convenience: upload rồi trả về secure URL (đã inject f_auto,q_auto).
 * Dùng cho các call site legacy chỉ cần string URL.
 */
export async function uploadMediaUrl(file: File | Blob, opts: UploadOptions): Promise<string> {
  const media = await uploadMedia(file, opts);
  return media.secureUrl;
}

/**
 * URL delivery đã tối ưu. Non-provider URL (legacy Supabase Storage) trả nguyên.
 */
export function getMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  const provider = findProviderForUrl(url);
  return provider ? provider.buildUrl(url) : url;
}

/**
 * Thumbnail theo bề rộng (px). Non-provider URL trả nguyên.
 */
export function getMediaThumb(url: string | null | undefined, width: number): string {
  if (!url) return "";
  const provider = findProviderForUrl(url);
  return provider ? provider.buildThumb(url, width) : url;
}

function findProviderForUrl(url: string): MediaProvider | undefined {
  return providers.find((p) => p.ownsUrl(url));
}

/**
 * Xoá media — client no-op (xoá Cloudinary cần API Secret ở server).
 */
export async function deleteMedia(_publicIdOrUrl: string): Promise<void> {
  // No-op ở client. DB có thể quên tham chiếu, provider tự dọn theo lifecycle rule.
  return;
}

/**
 * Replace: upload file mới rồi (tuỳ chọn) xoá file cũ.
 */
export async function replaceMedia(
  oldPublicIdOrUrl: string | null | undefined,
  newFile: File | Blob,
  opts: UploadOptions,
): Promise<UploadedMedia> {
  const uploaded = await uploadMedia(newFile, opts);
  if (oldPublicIdOrUrl) {
    try { await deleteMedia(oldPublicIdOrUrl); } catch { /* ignore */ }
  }
  return uploaded;
}

/** Suy ra `kind` từ tên folder legacy. */
function inferKindFromFolder(folder: string): MediaKind {
  const f = folder.toLowerCase();
  if (f.includes("avatar")) return "avatar";
  if (f.includes("story") || f.includes("stories")) return "story";
  if (f.includes("featured")) return "featured";
  if (f.includes("title") || f.includes("gif")) return "title";
  if (f.includes("video")) return "video";
  if (f.includes("chat") || f.includes("message")) return "chat";
  if (f.includes("comment")) return "comment";
  if (f.includes("gallery") || f.includes("profile")) return "gallery";
  if (f.includes("post")) return "post";
  return "other";
}

/**
 * Upload đơn giản theo folder → trả URL. Wrapper mỏng quanh `uploadMediaUrl`.
 */
export async function uploadFile(file: File | Blob, folder = "candy"): Promise<string> {
  return uploadMediaUrl(file, { kind: inferKindFromFolder(folder), folder });
}
