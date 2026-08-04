/**
 * Live Móc 🦋 — dữ liệu phòng Live do Admin tạo (Supabase #2).
 * Website KHÔNG phát video, chỉ hiển thị danh sách + popup liên hệ Admin.
 * Không realtime, không polling: chỉ fetch 1 lần khi mở tab.
 */
import { db2 } from "@/integrations/supabase/secondary-client";

export type LiveMocRoom = {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  viewers: number;
  is_online: boolean;
  visible: boolean;
  sort_order: number;
  contact_url: string;
  vip_url: string;
  /** Thời điểm bắt đầu Live (Admin nhập) — Frontend tự tính "Đã phát". */
  started_at: string;
  /** Thời điểm tạo phòng — dùng làm mốc dự phòng khi thiếu started_at. */
  created_at: string;
  /** Thời điểm kết thúc hiển thị — quá giờ này phòng tự ẩn (lọc ở Frontend). */
  ends_at: string;
  likes: number;
  comments: number;
  is_hot: boolean;
  /** Tài khoản website đang Live trong phòng này (id ở DB chính). */
  live_user_id: string | null;
};

export type LiveMocSettings = {
  admin_contact_url: string;
  vip_community_url: string;
};

export const DEFAULT_LIVE_SETTINGS: LiveMocSettings = {
  admin_contact_url: "",
  vip_community_url: "",
};

function normalizeRoom(row: Record<string, unknown>): LiveMocRoom {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    thumbnail_url: String(row.thumbnail_url ?? ""),
    viewers: Number(row.viewers ?? 0),
    is_online: Boolean(row.is_online ?? true),
    visible: Boolean(row.visible ?? true),
    sort_order: Number(row.sort_order ?? 0),
    contact_url: String(row.contact_url ?? ""),
    vip_url: String(row.vip_url ?? ""),
    started_at: row.started_at ? String(row.started_at) : "",
    created_at: row.created_at ? String(row.created_at) : "",
    ends_at: row.ends_at ? String(row.ends_at) : "",
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    is_hot: Boolean(row.is_hot ?? false),
    live_user_id: row.live_user_id ? String(row.live_user_id) : null,
  };
}

/** Danh sách phòng cho người dùng (chỉ phòng đang hiện). */
export async function fetchLiveRooms(includeHidden = false): Promise<LiveMocRoom[]> {
  let query = db2().from("live_moc_rooms").select("*");
  if (!includeHidden) query = query.eq("visible", true);
  const { data, error } = await query;
  if (error || !data) return [];
  const rooms = (data as Record<string, unknown>[]).map(normalizeRoom);
  if (includeHidden) {
    return rooms.sort((a, b) => a.sort_order - b.sort_order || b.likes - a.likes);
  }
  // Ưu tiên phòng nhiều tim nhất; bằng nhau thì nhiều người xem hơn lên trước.
  return rooms
    .filter((r) => isRoomLiveNow(r))
    .sort((a, b) => b.likes - a.likes || b.viewers - a.viewers);
}

/** Hết giờ kết thúc thì ẩn phòng (so sánh ngay ở Frontend, không cron/backend). */
export function isRoomLiveNow(room: LiveMocRoom, now: number = Date.now()): boolean {
  if (!room.ends_at) return true;
  const end = new Date(room.ends_at).getTime();
  if (!Number.isFinite(end)) return true;
  return now <= end;
}

/**
 * Nén + resize ảnh ngay trên trình duyệt trước khi upload:
 * rộng tối đa 900px, WebP nếu hỗ trợ, mục tiêu ~80–150KB.
 * Dùng canvas thuần — không thêm package, không base64 lưu DB.
 */
export async function compressLiveThumbnail(file: File): Promise<Blob> {
  const MAX_W = 900;
  const TARGET = 150 * 1024;
  const MIN_TARGET = 80 * 1024;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const supportsWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  const type = supportsWebp ? "image/webp" : "image/jpeg";

  const encode = (q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));

  let best: Blob | null = null;
  for (const q of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const blob = await encode(q);
    if (!blob) break;
    best = blob;
    if (blob.size <= TARGET) break;
  }
  if (best && best.size < MIN_TARGET) {
    const bigger = await encode(0.9);
    if (bigger && bigger.size <= TARGET) best = bigger;
  }
  return best ?? file;
}

/** Upload ảnh thumbnail (đã nén) lên Supabase Storage #2, chỉ trả về đường dẫn public. */
export async function uploadLiveThumbnail(file: File): Promise<string> {
  const blob = await compressLiveThumbnail(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `rooms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db2()
    .storage.from("live-thumbnails")
    .upload(path, blob, { cacheControl: "31536000", upsert: false, contentType: blob.type });
  if (error) throw new Error(error.message);
  return db2().storage.from("live-thumbnails").getPublicUrl(path).data.publicUrl;
}


let settingsCache: LiveMocSettings | null = null;

export function clearLiveSettingsCache() {
  settingsCache = null;
}

export async function fetchLiveSettings(force = false): Promise<LiveMocSettings> {
  if (settingsCache && !force) return settingsCache;
  const { data, error } = await db2()
    .from("live_moc_settings")
    .select("admin_contact_url,vip_community_url")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_LIVE_SETTINGS;
  const row = data as Record<string, unknown>;
  settingsCache = {
    admin_contact_url: String(row.admin_contact_url ?? ""),
    vip_community_url: String(row.vip_community_url ?? ""),
  };
  return settingsCache;
}

/** Định dạng số: 1286 -> "1.286" */
export function formatViewers(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(n || 0)));
}

/** Thời lượng đã phát: "01:24:18" (tính hoàn toàn ở trình duyệt). */
export function formatElapsed(startedAt: string, now: number = Date.now()): string {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
