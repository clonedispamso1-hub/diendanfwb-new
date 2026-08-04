/**
 * MediaService — shared types.
 *
 * Toàn bộ upload media trong project ĐI QUA MediaService (`uploadMedia`).
 * Không component nào được gọi Cloudinary / Supabase Storage trực tiếp.
 */

export type MediaKind =
  | "avatar"
  | "post"
  | "video"
  | "story"
  | "comment"
  | "chat"
  | "banner"
  | "gallery"
  | "featured"
  | "title"
  | "verification"
  | "other";

export type ResourceType = "image" | "video" | "raw";

export interface UploadOptions {
  /** Domain của media — dùng để chọn folder & tuỳ chọn nén mặc định. */
  kind: MediaKind;
  /** Ghi đè folder (nếu cần). Nếu không có sẽ suy ra từ `kind` + `file.type`. */
  folder?: string;
  /** Nén ảnh trước khi upload. Mặc định true cho ảnh, false cho video. */
  compress?: boolean;
  /** Kích thước tối đa (px, cạnh dài) khi nén ảnh. */
  maxWidthOrHeight?: number;
  /** Kích thước tối đa (MB) sau khi nén ảnh. */
  maxSizeMB?: number;
  /** Progress 0..100. */
  onProgress?: (percent: number) => void;
  /** Huỷ upload. */
  signal?: AbortSignal;
}

export interface UploadedMedia {
  provider: string;
  publicId: string;
  secureUrl: string;
  resourceType: ResourceType;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
}

export interface MediaProvider {
  readonly name: string;
  /** Trả `false` để service bỏ qua provider (VD: hết quota / disabled). */
  isEnabled(): boolean;
  upload(
    file: File | Blob,
    filename: string,
    opts: UploadOptions,
  ): Promise<UploadedMedia>;
  /** URL delivery đã tối ưu (nếu provider hỗ trợ transformation). */
  buildUrl(secureUrl: string): string;
  /** Thumbnail theo bề rộng (px). */
  buildThumb(secureUrl: string, width: number): string;
  /** Nhận biết URL có thuộc provider này không (dùng cho delete/thumb). */
  ownsUrl(url: string): boolean;
}
