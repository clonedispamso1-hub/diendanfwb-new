/**
 * VIP assets — NGUỒN DUY NHẤT: bảng vip_icons ("Quản Lý Icon VIP").
 *
 * - File ảnh/GIF lưu trên **Cloudinary** (folder `vip/icons/*`, `vip/gifs/*`).
 *   KHÔNG dùng Supabase Storage nữa.
 * - Metadata (public_id, secure_url, kích thước, folder) nằm ở bảng
 *   public.vip_icons (NGUỒN DUY NHẤT — "Quản Lý Icon VIP").
 * - Frontend chỉ đọc URL từ database.
 */
import { supabase } from "@/lib/db/router";
import { uploadGifToStorage } from "@/lib/gif-storage";

const sb = supabase as any;

/**
 * Insert 1 dòng VIP kèm metadata Cloudinary. Nếu DB chưa có các cột phụ
 * (public_id, secure_url, bytes, width, height, cloud_folder) thì tự động
 * bỏ chúng đi — không cần đổi cấu trúc database hiện có.
 */
async function insertVipRow(
  table: "vip_icons",
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const run = (payload: Record<string, unknown>) =>
    sb.from(table).insert(payload).select("id, name, url, storage_path, is_active, sort_order, created_at, created_by, folder, use_count, public_id, secure_url, bytes, width, height, cloud_folder, is_admin_only").single();

  let res = await run({ ...base, ...extra });
  if (res.error && missingColumn(res.error.message)) res = await run(base);
  // Bảng cũ có thể chưa có cột `folder`.
  if (res.error && missingColumn(res.error.message)) {
    const { folder: _drop, ...noFolder } = base;
    res = await run(noFolder);
  }
  return res;
}


export const VIP_ICON_BUCKET = "vip_icons";
export const VIP_ICON_NOTE = "⭐ Icon độc quyền của tài khoản Admin/Clone.";

export type VipIcon = {
  id: string;
  name: string;
  url: string;
  storage_path: string | null;
  folder: string;
  is_active: boolean;
  is_admin_only?: boolean;
  use_count?: number;
  created_at: string;
};

export const VIP_DEFAULT_FOLDER = "Mặc định";

/** Thư mục gợi ý sẵn (tạo nhanh 1 click trong trang quản lý). */
export const VIP_ICON_FOLDER_PRESETS = [
  "Telegram", "Anime", "Neon", "VIP", "Crown", "Event", "Tết", "Halloween", "Noel",
];

/** Cột `folder` / `use_count` chỉ có sau khi chạy SQL Phase 2 — tự nhận biết. */
function missingColumn(msg?: string | null) {
  const m = (msg || "").toLowerCase();
  return m.includes("column") || m.includes("schema cache") || m.includes("does not exist");
}



/** Gốc folder trên Cloudinary cho kho VIP. */
export const VIP_CLOUDINARY_ROOT = "vip";


/** "Mặc định" → "mac-dinh" (Cloudinary chỉ nhận ký tự an toàn cho folder). */
function slugFolder(name: string): string {
  const s = (name || VIP_DEFAULT_FOLDER)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return s || "default";
}

export type CloudinaryUpload = {
  publicId: string;
  url: string;
  bytes: number;
  width?: number;
  height?: number;
  cloudFolder: string;
};

/** Lỗi có nhãn để UI hiển thị đúng toast (Cloudinary / Database / Query). */
export class VipStageError extends Error {
  constructor(
    public stage: "cloudinary" | "insert" | "query",
    message: string,
  ) {
    super(message);
    this.name = "VipStageError";
  }
}

/**
 * Upload lên Cloudinary bằng ĐÚNG uploader của Kho GIF (`uploadGifToStorage`),
 * chỉ đổi folder: `vip/icons/<folder>` hoặc `vip/gifs/<folder>`.
 */
async function uploadToCloudinary(
  file: File,
  kind: "icons" | "gifs",
  folder: string,
): Promise<CloudinaryUpload> {
  const cloudFolder = `${VIP_CLOUDINARY_ROOT}/${kind}/${slugFolder(folder)}`;
  try {
    const up = await uploadGifToStorage(file, {
      isAdmin: true,
      folder: cloudFolder,
      dedupe: false,
    });
    if (!up.url) throw new Error("Cloudinary không trả về secure_url");
    return {
      publicId: up.publicId,
      url: up.url,
      bytes: up.bytes ?? file.size ?? 0,
      width: up.width,
      height: up.height,
      cloudFolder,
    };
  } catch (e: any) {
    console.error("[vip-upload] Cloudinary failed", { file: file.name, cloudFolder, error: e });
    throw new VipStageError("cloudinary", e?.message || "Cloudinary Upload Failed");
  }
}


/* ------------------------------ ICON VIP ------------------------------ */

/** Định dạng nhận vào kho VIP (giống Kho GIF: ảnh + webm/mp4). */
export const VIP_MEDIA_ACCEPT =
  "image/*,video/webm,video/mp4,.png,.webp,.svg,.gif,.jpg,.jpeg,.avif,.apng,.webm,.mp4";
export const VIP_ICON_ACCEPT = VIP_MEDIA_ACCEPT;

const VIP_MEDIA_RE = /\.(gif|png|jpe?g|webp|svg|ico|apng|avif|bmp|webm|mp4)$/i;

/** File nào được nhận vào kho Icon VIP (dùng cho cả Upload thư mục). */
export function isVipIconFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    type === "video/webm" ||
    type === "video/mp4" ||
    VIP_MEDIA_RE.test(file.name || "")
  );
}

export async function fetchVipIconFolders(): Promise<string[]> {
  const { data, error } = await sb
    .from("vip_icon_folders")
    .select("name")
    .order("created_at", { ascending: true }).limit(50);
  if (!error) {
    const names = (data ?? []).map((r: { name: string }) => r.name);
    return names.length ? names : [VIP_DEFAULT_FOLDER];
  }
  // Chưa chạy SQL Phase 2 → lấy folder đang có trong vip_icons.
  const fallback = await sb.from("vip_icons").select("folder").limit(300);
  const names = Array.from(
    new Set(((fallback.data ?? []) as Array<{ folder?: string }>).map((r) => r.folder).filter(Boolean)),
  ) as string[];
  return names.length ? names : [VIP_DEFAULT_FOLDER];
}

export async function createVipIconFolder(name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Tên thư mục trống");
  const { error } = await sb.from("vip_icon_folders").insert({ name: clean });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  return clean;
}

export async function deleteVipIconFolder(name: string) {
  const { error } = await sb.from("vip_icon_folders").delete().eq("name", name);
  if (error) throw new Error(error.message);
}

export async function fetchVipIcons(opts?: {
  activeOnly?: boolean;
  folder?: string | null;
  /** true → chỉ lấy icon công khai (ẩn kho độc quyền của Admin). */
  publicOnly?: boolean;
}): Promise<VipIcon[]> {
  const run = async (withFolder: boolean) => {
    let query = sb
      .from("vip_icons")
      .select(
        withFolder
          ? "id, name, url, storage_path, folder, is_active, is_admin_only, use_count, created_at"
          : "id, name, url, storage_path, is_active, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (opts?.activeOnly) query = query.eq("is_active", true);
    if (withFolder && opts?.folder) query = query.eq("folder", opts.folder);
    if (withFolder && opts?.publicOnly) query = query.eq("is_admin_only", false);
    return query;
  };
  let { data, error } = await run(true);
  if (error && missingColumn(error.message)) ({ data, error } = await run(false));
  console.info("[vip-icons] query", { count: (data ?? []).length, error });
  if (error) throw new VipStageError("query", error.message);
  return ((data ?? []) as VipIcon[]).map((r) => ({ ...r, folder: r.folder || VIP_DEFAULT_FOLDER }));
}

export async function uploadVipIcon(
  file: File,
  opts?: { folder?: string; name?: string },
): Promise<VipIcon> {
  if (!isVipIconFile(file)) throw new Error(`Chỉ nhận ảnh / GIF / WEBM / MP4: ${file.name}`);
  const folder = opts?.folder || VIP_DEFAULT_FOLDER;
  const up = await uploadToCloudinary(file, "icons", folder);
  if (!up.url) {
    throw new VipStageError(
      "cloudinary",
      "Cloudinary không trả về secure_url; đã hủy ghi dữ liệu Icon VIP.",
    );
  }
  const base = {
    name: (opts?.name || file.name.replace(/\.[^.]+$/, "")).slice(0, 60),
    url: up.url,
    // Giữ nguyên cấu trúc bảng: `storage_path` nay lưu Cloudinary public_id.
    storage_path: up.publicId,
    is_active: true,
  };
  const extra = {
    public_id: up.publicId,
    secure_url: up.url,
    bytes: up.bytes,
    width: up.width,
    height: up.height,
    cloud_folder: up.cloudFolder,
    // Kho VIP: chỉ Admin thấy & dùng được.
    is_admin_only: true,
  };

  const { data, error } = await insertVipRow("vip_icons", { ...base, folder }, extra);
  if (error) {
    console.error("[vip-icons] insert failed", { base, extra, error });
    throw new VipStageError(
      "insert",
      /row-level security|permission/i.test(error.message)
        ? "Không có quyền ghi bảng vip_icons (RLS). Hãy chạy file docs/sql/RUN_NOW_2026-08-07_VIP_ICONS_CLOUDINARY_FIX.sql."
        : error.message,
    );
  }
  console.info("[vip-icons] inserted", data);
  invalidateVipIconCache();
  return { ...(data as VipIcon), folder: (data as VipIcon).folder || VIP_DEFAULT_FOLDER };
}


export async function setVipIconActive(id: string, active: boolean) {
  const { error } = await sb.from("vip_icons").update({ is_active: active }).eq("id", id);
  if (error) throw new Error(error.message);
  invalidateVipIconCache();
}

export async function renameVipIcon(id: string, name: string) {
  const { error } = await sb.from("vip_icons").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveVipIcon(id: string, folder: string) {
  const { error } = await sb.from("vip_icons").update({ folder }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVipIcon(icon: VipIcon) {
  const { error } = await sb.from("vip_icons").delete().eq("id", icon.id);
  if (error) throw new Error(error.message);
  // File nằm trên Cloudinary — chỉ xoá metadata trong DB.

  invalidateVipIconCache();
}

/** Xoá hàng loạt: DELETE FROM vip_icons WHERE id IN (...). */
export async function deleteVipIcons(ids: string[]) {
  if (!ids.length) return 0;
  const { error } = await sb.from("vip_icons").delete().in("id", ids);
  if (error) throw new Error(error.message);
  invalidateVipIconCache();
  return ids.length;
}

/** Gán (hoặc gỡ khi iconId = null) icon VIP cho nhiều tài khoản. */
export async function setVipIconForAccounts(ids: string[], iconId: string | null) {
  if (!ids.length) return 0;
  const { data, error } = await sb.rpc("admin_set_vip_icon", { p_ids: ids, p_icon_id: iconId });
  if (error) throw new Error(error.message);
  ids.forEach((id) => vipIconByUser.delete(id));
  notifyVipIconChange();
  return Number(data ?? ids.length);
}

/** Trộn mảng (Fisher–Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random icon VIP cho hàng loạt tài khoản.
 * - `unique`: mỗi tài khoản một icon khác nhau khi còn icon chưa dùng.
 * - `reuse`: hết icon thì random lại từ đầu (nếu tắt, phần còn lại bị bỏ qua).
 */
export async function randomizeVipIconsForAccounts(
  ids: string[],
  opts?: { folder?: string | null; unique?: boolean; reuse?: boolean },
): Promise<{ updated: number; icons: number }> {
  if (!ids.length) return { updated: 0, icons: 0 };
  const pool = await fetchVipIcons({ activeOnly: true, folder: opts?.folder ?? null });
  if (!pool.length) throw new Error("Chưa có Icon VIP nào đang bật để random");

  const unique = opts?.unique !== false;
  const reuse = opts?.reuse !== false;
  const assignment = new Map<string, string[]>(); // iconId -> userIds

  let bag: VipIcon[] = shuffle(pool);
  for (let i = 0; i < ids.length; i++) {
    let icon: VipIcon | undefined;
    if (!unique) {
      icon = pool[Math.floor(Math.random() * pool.length)];
    } else {
      if (!bag.length) {
        if (!reuse) break;
        bag = shuffle(pool);
      }
      icon = bag.pop();
    }
    if (!icon) break;
    const list = assignment.get(icon.id) ?? [];
    list.push(ids[i]);
    assignment.set(icon.id, list);
  }

  let updated = 0;
  for (const [iconId, users] of assignment) {
    updated += await setVipIconForAccounts(users, iconId);
  }
  return { updated, icons: assignment.size };
}



/** URL nào thuộc kho Icon VIP. */
export function isVipIconUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes(`/${VIP_ICON_BUCKET}/`) || /\/vip\/icons\//.test(url);
}

/* ------------------ Resolver icon theo user (batch + cache) ------------------ */

type UserIcon = { icon_id: string; name: string; url: string } | null;

const vipIconByUser = new Map<string, UserIcon>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notifyVipIconChange() {
  listeners.forEach((fn) => fn());
}

export function invalidateVipIconCache() {
  vipIconByUser.clear();
  notifyVipIconChange();
}

export function subscribeVipIcons(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCachedVipIcon(userId: string): UserIcon | undefined {
  return vipIconByUser.get(userId);
}

async function flushBatch() {
  timer = null;
  const ids = Array.from(pending);
  pending = new Set();
  if (!ids.length) return;
  ids.forEach((id) => {
    if (!vipIconByUser.has(id)) vipIconByUser.set(id, null);
  });
  try {
    const { data, error } = await sb.rpc("vip_icons_for_users", { p_ids: ids });
    if (error) throw error;
    (data ?? []).forEach((r: { user_id: string; icon_id: string; name: string; url: string }) => {
      vipIconByUser.set(r.user_id, { icon_id: r.icon_id, name: r.name, url: r.url });
    });
  } catch {
    /* chưa chạy SQL hoặc lỗi mạng — coi như không có icon, không làm ồn UI */
  }
  notifyVipIconChange();
}

/** Yêu cầu nạp icon VIP của 1 user (gộp nhiều yêu cầu thành 1 query). */
export function requestVipIcon(userId: string) {
  if (!userId || vipIconByUser.has(userId) || pending.has(userId)) return;
  pending.add(userId);
  if (!timer) timer = setTimeout(() => void flushBatch(), 60);
}

/* ---------------- MEDIA VIP: chọn & gán hàng loạt (1 NGUỒN) ----------------
 *
 * NGUỒN DUY NHẤT = "Quản Lý Icon VIP" (bảng public.vip_icons).
 * Không còn bảng vip_gifs / GIF độc quyền. Không đọc gif_library (Kho GIF chung).
 */

/**
 * Nguồn Media VIP khi random cho clone.
 *  - `all`      : random toàn bộ kho Icon VIP đang bật
 *  - `folder`   : random theo thư mục
 *  - `selected` : chọn bằng tay (đúng danh sách & đúng thứ tự đã chọn)
 */
export type VipMediaPickMode = "all" | "folder" | "selected";

export type VipMediaSelection = {
  mode: VipMediaPickMode;
  folder?: string | null;
  /** URL các media đã chọn tay (mode = "selected") — giữ nguyên thứ tự. */
  urls?: string[];
};

/** Lấy pool URL theo lựa chọn (dùng chung cho mọi nơi random Media VIP). */
export async function resolveVipMediaPool(sel: VipMediaSelection): Promise<string[]> {
  if (sel.mode === "selected") {
    const urls = (sel.urls ?? []).filter(Boolean);
    if (!urls.length) throw new Error("Chưa chọn Media VIP nào trong danh sách");
    return urls;
  }
  const pool = await fetchVipIcons({
    activeOnly: true,
    folder: sel.mode === "folder" ? sel.folder ?? null : null,
  });
  if (!pool.length) {
    throw new Error(
      sel.mode === "folder"
        ? "Thư mục này chưa có Media VIP nào đang bật"
        : "Kho Icon VIP đang trống — vào Admin → Quản lý Icon VIP để upload",
    );
  }
  return pool.map((g) => g.url);
}

/**
 * Random `count` URL Media VIP theo lựa chọn.
 * `unique = true` → cố gắng mỗi phần tử một media khác nhau, hết thì quay vòng.
 */
export async function pickVipMediaUrls(
  count: number,
  sel: VipMediaSelection,
  opts?: { unique?: boolean },
): Promise<string[]> {
  if (count <= 0) return [];
  const pool = await resolveVipMediaPool(sel);
  const unique = opts?.unique !== false;
  const out: string[] = [];
  let bag = shuffle(pool);
  for (let i = 0; i < count; i++) {
    if (!unique) {
      out.push(pool[Math.floor(Math.random() * pool.length)]);
      continue;
    }
    if (!bag.length) bag = shuffle(pool);
    out.push(bag.pop() as string);
  }
  return out;
}

/** Random Media VIP cho hàng loạt tài khoản (mỗi clone 1 media). */
export async function randomizeVipMediaForAccounts(
  ids: string[],
  sel: VipMediaSelection,
  opts?: { unique?: boolean },
): Promise<{ updated: number; media: number }> {
  if (!ids.length) return { updated: 0, media: 0 };
  const { setCloneVipMedia } = await import("@/lib/clone-vip-media");
  const urls = await pickVipMediaUrls(ids.length, sel, opts);
  const groups = new Map<string, string[]>();
  ids.forEach((id, i) => {
    const url = urls[i];
    if (!url) return;
    const list = groups.get(url) ?? [];
    list.push(id);
    groups.set(url, list);
  });
  let updated = 0;
  for (const [url, users] of groups) updated += await setCloneVipMedia(users, [url]);
  return { updated, media: groups.size };
}
