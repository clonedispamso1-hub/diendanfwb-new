import { supabase } from "@/lib/db/router";
import { adminDb, adminSetSiteSetting } from "@/lib/admin-db";
import { getTemplate, type TemplateKey } from "@/lib/popup-templates";
import { getSiteSetting } from "@/lib/site-settings-cache";

const TABLE = "admin_popups";

/**
 * Phiên Admin (Bang Chủ) được lưu ở client riêng (storageKey "candy.admin.auth").
 * Mọi thao tác GHI phải đi qua client đang có session, nếu không request gửi lên
 * dưới quyền anon → auth.uid() = null → RLS chặn.
 */
// Nguồn duy nhất chọn client có phiên Admin — xem src/lib/admin-db.ts
async function writeDb() {
  return (await adminDb()) as any;
}

/** Cấu hình phụ được lưu JSON trong cột `style` (text) của bảng admin_popups. */
export interface PopupExtra {
  template: TemplateKey;
  fontSize: number;
  textColor: string;
  facebook: string;
  zalo: string;
  website: string;
  /** Chu kỳ được phép hiện lại (phút). Mặc định 1440 = 24h. */
  repeatMinutes: number;
}

export interface PopupRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  button_text: string | null;
  button_url: string | null;
  style: string | null;
  status: string;
  priority: number;
  created_at: string;
}

/** Popup đã giải mã, dùng trực tiếp trong UI. */
export interface PopupItem extends PopupExtra {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  buttonText: string;
  enabled: boolean;
  order: number;
}

function decode(row: PopupRow): PopupItem {
  let extra: Partial<PopupExtra> = {};
  try {
    if (row.style && row.style.trim().startsWith("{")) {
      extra = JSON.parse(row.style);
    }
  } catch {
    /* ignore */
  }
  const tpl = getTemplate(extra.template);
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.description ?? "",
    imageUrl: row.image_url ?? "",
    buttonText: row.button_text ?? "",
    enabled: row.status === "active",
    order: row.priority ?? 5,
    template: tpl.key,
    fontSize: Number(extra.fontSize) || 16,
    textColor: extra.textColor || "",
    facebook: extra.facebook || "",
    zalo: extra.zalo || "",
    website: extra.website || "",
    repeatMinutes: Number(extra.repeatMinutes) > 0 ? Number(extra.repeatMinutes) : 1440,
  };
}

function encode(item: Partial<PopupItem>) {
  const extra: PopupExtra = {
    template: (item.template ?? "announcement") as TemplateKey,
    fontSize: item.fontSize ?? 16,
    textColor: item.textColor ?? "",
    facebook: item.facebook ?? "",
    zalo: item.zalo ?? "",
    website: item.website ?? "",
    repeatMinutes: Number(item.repeatMinutes) > 0 ? Number(item.repeatMinutes) : 1440,
  };
  return {
    title: item.title ?? "",
    description: item.content ?? "",
    image_url: item.imageUrl || null,
    button_text: item.buttonText || null,
    button_url: item.website || null,
    style: JSON.stringify(extra),
    status: item.enabled ? "active" : "disabled",
    priority: item.order ?? 5,
  };
}

const SELECT =
  "id,title,description,image_url,button_text,button_url,style,status,priority,created_at";

/** Tất cả popup (dùng cho Admin Panel). */
export async function listPopups(): Promise<PopupItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true }).limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as PopupRow[]).map(decode);
}

/** Popup đang bật — hiển thị lần lượt theo thứ tự admin bật. */
export async function getActivePopups(): Promise<PopupItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq("status", "active")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true }).limit(20);
  if (error) throw error;
  return ((data ?? []) as unknown as PopupRow[]).map(decode);
}

/* ------------------------------------------------------------------
 * Popup đang bật — CACHE để không tạo request Supabase liên tục.
 * Đọc 1 lần/phiên tab (sessionStorage, TTL ngắn). Admin bấm Lưu/Sử dụng
 * ⇒ invalidateActivePopup() ⇒ lần load sau lấy cấu hình mới ngay.
 * ------------------------------------------------------------------ */
const ACTIVE_CACHE_KEY = "candy.popup.active.v1";
const ACTIVE_TTL_MS = 60_000;

let memActive: { at: number; item: PopupItem | null } | null = null;

function readCache(): { at: number; item: PopupItem | null } | null {
  if (memActive) return memActive;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; item: PopupItem | null };
    if (!parsed || typeof parsed.at !== "number") return null;
    memActive = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(item: PopupItem | null) {
  const payload = { at: Date.now(), item };
  memActive = payload;
  try {
    window.sessionStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

/** Xoá cache popup đang bật (gọi sau khi Admin lưu / bật / tắt popup). */
export function invalidateActivePopup() {
  memActive = null;
  try {
    window.sessionStorage.removeItem(ACTIVE_CACHE_KEY);
  } catch {
    /* noop */
  }
}

/** Popup DUY NHẤT đang bật (đọc có cache). */
export async function getActivePopup(): Promise<PopupItem | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < ACTIVE_TTL_MS) return cached.item;
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .eq("status", "active")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as unknown as PopupRow[])[0];
  const item = row ? decode(row) : null;
  writeCache(item);
  return item;
}

export async function createPopup(item: Partial<PopupItem>): Promise<PopupItem> {
  const db = await writeDb();
  const { data, error } = await db
    .from(TABLE)
    .insert(encode(item))
    .select(SELECT)
    .single();
  if (error) throw error;
  return decode(data as unknown as PopupRow);
}

export async function updatePopup(
  id: string,
  item: Partial<PopupItem>,
): Promise<PopupItem> {
  const db = await writeDb();
  const { data, error } = await db
    .from(TABLE)
    .update(encode(item))
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return decode(data as unknown as PopupRow);
}

export async function setPopupEnabled(id: string, enabled: boolean) {
  const db = await writeDb();
  const { error } = await db
    .from(TABLE)
    .update({ status: enabled ? "active" : "disabled" })
    .eq("id", id);
  if (error) throw error;
}

/** Chỉ một popup được bật cùng lúc: tắt mọi popup khác rồi bật popup này. */
export async function activateOnly(id: string): Promise<void> {
  const db = await writeDb();
  const off = await db
    .from(TABLE)
    .update({ status: "disabled" })
    .eq("status", "active")
    .neq("id", id);
  if (off.error) throw off.error;
  const on = await db.from(TABLE).update({ status: "active" }).eq("id", id);
  if (on.error) throw on.error;
}

/** Tắt toàn bộ popup — website không hiện popup nào. */
export async function disableAllPopups(): Promise<void> {
  const db = await writeDb();
  const { error } = await db
    .from(TABLE)
    .update({ status: "disabled" })
    .eq("status", "active");
  if (error) throw error;
}

export async function deletePopup(id: string): Promise<void> {
  const db = await writeDb();
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Maintenance ----------------

export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  description: string;
  image_url: string;
  font_size: number;
  text_color: string;
  facebook: string;
  zalo: string;
  contact_text: string;
  contact_url: string;
  /** giữ lại cho tương thích dữ liệu cũ */
  logo_url?: string;
  bg_url?: string;
  eta?: string;
  progress?: number;
}

export const MAINTENANCE_DEFAULT: MaintenanceSettings = {
  enabled: false,
  title: "Website đang bảo trì",
  description:
    "Chúng tôi đang nâng cấp hệ thống để mang lại trải nghiệm tốt hơn. Vui lòng quay lại sau ít phút nhé!",
  image_url: "",
  font_size: 16,
  text_color: "",
  facebook: "",
  zalo: "",
  contact_text: "Liên hệ Admin",
  contact_url: "",
};

function normalizeMaintenanceValue(value: unknown): Partial<MaintenanceSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Partial<Omit<MaintenanceSettings, "enabled" | "font_size">> & {
    enabled?: unknown;
    font_size?: unknown;
  };
  return {
    ...raw,
    enabled: raw.enabled === true || raw.enabled === "true" || raw.enabled === 1,
    font_size: Number(raw.font_size) || MAINTENANCE_DEFAULT.font_size,
  };
}

export async function getMaintenance(): Promise<MaintenanceSettings> {
  // Chế độ bảo trì đã bị vô hiệu hóa hoàn toàn: luôn trả về enabled: false,
  // bỏ qua cấu hình từ database/localStorage.
  return {
    ...MAINTENANCE_DEFAULT,
    enabled: false,
  };
}

export async function saveMaintenance(v: MaintenanceSettings): Promise<void> {
  await adminSetSiteSetting("maintenance", v);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("maintenance-setting-changed"));
  }
}
