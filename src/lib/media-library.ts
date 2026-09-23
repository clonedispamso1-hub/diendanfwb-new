/**
 * Trung tâm Media dùng chung (GIF / Sticker / Icon).
 *
 * - Mọi lượt upload đi THẲNG lên Cloudflare R2 (folder `FWB/GIF`).
 * - Chỉ URL hợp lệ mới được lưu vào bảng `public.gif_library`.
 * - Mỗi bản ghi có thêm: `folder_name` (thư mục) và `access_level`
 *   ('public' | 'vip' | 'admin') để phân quyền hiển thị ngoài trang chủ.
 */
import { supabase } from "@/lib/supabase";
import { cachedQuery, invalidateCache } from "@/lib/request-cache";
import { r2Provider } from "@/lib/media/providers";

export type MediaKind = "gif" | "sticker" | "icon";
export type AccessLevel = "public" | "vip" | "admin";

export const MEDIA_KINDS: { key: MediaKind; label: string }[] = [
  { key: "gif", label: "GIF" },
  { key: "sticker", label: "Sticker" },
  { key: "icon", label: "Icon" },
];

export const ACCESS_LEVELS: { key: AccessLevel; label: string; hint: string }[] = [
  { key: "public", label: "Công khai", hint: "Tất cả thành viên đều dùng được" },
  { key: "vip", label: "Dành cho VIP", hint: "Chỉ thành viên VIP mới dùng được" },
  { key: "admin", label: "Độc quyền Admin", hint: "Chỉ Admin mới dùng được" },
];

/** Thư mục gốc trên Cloudinary cho toàn bộ kho media dùng chung. */
export const MEDIA_ROOT_FOLDER = "FWB/GIF";

/**
 * Lỗi khi Unsigned Upload Preset chưa tồn tại trên Cloudinary Console.
 * Thông điệp này được hiển thị nguyên văn qua Toast cho Admin.
 */
export class CloudinaryPresetError extends Error {
  code = "CLOUDINARY_PRESET_NOT_FOUND" as const;
  constructor(public preset: string) {
    super(
      `Chưa cấu hình Unsigned Upload Preset '${preset}' trên Cloudinary Console`,
    );
    this.name = "CloudinaryPresetError";
  }
}

/**
 * Các quyền mà một người dùng được phép NHÌN THẤY.
 *
 * NGHIÊM NGẶT: GIF/Icon `vip` và `admin` CHỈ dành cho tài khoản Admin
 * (trong Admin Panel hoặc khi Admin bình luận). Thành viên thường và cả
 * thành viên VIP khi lướt/bình luận ngoài trang chủ chỉ thấy `public`.
 */
export function allowedLevelsFor(opts: {
  isAdmin: boolean;
  isVip?: boolean;
  /** Clone (tài khoản thứ hai, profiles.account_source = 'internal'). */
  isClone?: boolean;
}): AccessLevel[] {
  return opts.isAdmin || opts.isClone ? ["public", "vip", "admin"] : ["public"];
}

function sanitizeFolder(name: string): string {
  return (name || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 40)
    .trim();
}

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  bytes: number;
  width?: number;
  height?: number;
}

/* --------------------------- Lọc file hợp lệ --------------------------- */

/** Đuôi file được chấp nhận (ảnh + animation/video ngắn). */
const ALLOWED_EXT = /\.(gif|png|jpe?g|webp|svg|ico|apng|avif|bmp|webm|mp4)$/i;
/** File rác của hệ điều hành. */
const JUNK_NAME = /^(\.|__MACOSX)|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

/** true khi file là ảnh/GIF/WebM hợp lệ, không rỗng, không phải file ẩn hệ thống. */
export function isUploadableMediaFile(file: File): boolean {
  const name = (file as any).webkitRelativePath || file.name || "";
  const base = name.split("/").pop() || name;
  if (!base || JUNK_NAME.test(base)) return false;
  if (!file.size) return false;
  const type = (file.type || "").toLowerCase();
  const typeOk =
    type.startsWith("image/") || type === "video/webm" || type === "video/mp4";
  return typeOk || ALLOWED_EXT.test(base);
}

/** Tách danh sách file thành hợp lệ / bị bỏ qua. */
export function filterUploadableFiles(files: File[]): { valid: File[]; skipped: File[] } {
  const valid: File[] = [];
  const skipped: File[] = [];
  for (const f of files) (isUploadableMediaFile(f) ? valid : skipped).push(f);
  return { valid, skipped };
}

/**
 * Upload 1 file lên Cloudflare R2 (folder `FWB/GIF/<thư mục>`), có tiến độ (%).
 * Từ 2026-09: kho media dùng chung KHÔNG còn ghi lên Cloudinary.
 * Giữ nguyên tên hàm/kiểu trả về để các màn hình Admin không phải sửa.
 */
export function uploadToCloudinary(
  file: File,
  opts: { folder?: string; root?: string; onProgress?: (pct: number) => void } = {},
): Promise<CloudinaryUploadResult> {
  const folder = [opts.root || MEDIA_ROOT_FOLDER, sanitizeFolder(opts.folder ?? "")]
    .filter(Boolean)
    .join("/")
    .replace(/[^\w/\-. ]+/g, "_");

  if (!file || typeof (file as any).arrayBuffer !== "function") {
    return Promise.reject(new Error("File không hợp lệ."));
  }
  if (!isUploadableMediaFile(file)) {
    return Promise.reject(
      new Error(`File "${file.name || "?"}" không phải ảnh/GIF/WebM hợp lệ.`),
    );
  }

  return r2Provider
    .upload(file, file.name || `media-${Date.now()}`, {
      kind: "title",
      folder,
      compress: false,
      onProgress: opts.onProgress,
    })
    .then((up) => ({
      secureUrl: up.secureUrl,
      publicId: up.publicId,
      bytes: up.bytes ?? file.size,
      width: up.width,
      height: up.height,
    }));
}

/* ------------------------------ Supabase ------------------------------- */

export interface MediaRow {
  id: string;
  url: string;
  kind: MediaKind;
  label: string;
  keywords: string[] | null;
  folder_name: string | null;
  access_level: AccessLevel;
  sort_order?: number | null;
  created_at?: string;
}

const SELECT_FULL = "id, url, kind, label, keywords, folder_name, access_level, sort_order, created_at";
const SELECT_BASE = "id, url, kind, label, keywords, sort_order, created_at";

/** true khi bảng đã có 2 cột mới (folder_name / access_level). */
let extendedSchema: boolean | null = null;

export function mediaSelectColumns(): string {
  return extendedSchema === false ? SELECT_BASE : SELECT_FULL;
}

export function markLegacySchema() {
  extendedSchema = false;
}

export function isSchemaError(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("folder_name") || msg.includes("access_level") || error?.code === "42703";
}

export function normalizeRow(r: any): MediaRow {
  return {
    id: String(r.id),
    url: String(r.url),
    kind: (r.kind as MediaKind) ?? "gif",
    label: String(r.label ?? ""),
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    folder_name: r.folder_name ?? null,
    access_level: (r.access_level as AccessLevel) ?? "public",
    sort_order: r.sort_order ?? null,
    created_at: r.created_at,
  };
}

/** Danh sách toàn bộ media (dùng cho trang quản trị). */
export async function fetchAllMedia(): Promise<MediaRow[]> {
  const run = async (columns: string) =>
    supabase
      .from("gif_library" as any)
      .select(columns)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

  let { data, error } = await run(mediaSelectColumns());
  if (error && isSchemaError(error)) {
    markLegacySchema();
    ({ data, error } = await run(SELECT_BASE));
  }
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeRow);
}

/** Danh sách thư mục hiện có. */
export async function fetchMediaFolders(): Promise<string[]> {
  if (extendedSchema === false) return [];
  // Cache + dedupe 60s: danh sách thư mục được nhiều panel gọi lại liên tục.
  return cachedQuery("media:folders", fetchMediaFoldersRaw, 60_000);
}

export function invalidateMediaFolders() {
  invalidateCache("media:folders");
}

async function fetchMediaFoldersRaw(): Promise<string[]> {
  const { data, error } = await supabase
    .from("gif_library" as any)
    .select("folder_name")
    .limit(200);
  if (error) {
    if (isSchemaError(error)) markLegacySchema();
    return [];
  }
  const set = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    const f = (r.folder_name ?? "").trim();
    if (f) set.add(f);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
}

export interface InsertMediaInput {
  url: string;
  kind: MediaKind;
  label: string;
  folderName: string;
  accessLevel: AccessLevel;
}

/** Lưu bản ghi media vào Supabase (tự lùi về schema cũ nếu thiếu cột). */
export async function insertMediaRows(rows: InsertMediaInput[]): Promise<void> {
  if (!rows.length) return;
  const full = rows.map((r) => ({
    url: r.url,
    kind: r.kind,
    label: r.label,
    keywords: [],
    folder_name: sanitizeFolder(r.folderName) || null,
    access_level: r.accessLevel,
  }));
  const base = rows.map((r) => ({ url: r.url, kind: r.kind, label: r.label, keywords: [] }));

  let { error } = await supabase
    .from("gif_library" as any)
    .insert((extendedSchema === false ? base : full) as any);
  if (error && isSchemaError(error)) {
    markLegacySchema();
    ({ error } = await supabase.from("gif_library" as any).insert(base as any));
  }
  if (error) throw new Error(error.message);
  invalidateMediaFolders();
}

export { sanitizeFolder };
