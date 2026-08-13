/**
 * Feature Popups — HỆ THỐNG POPUP DÙNG CHUNG (Popup Engine).
 *
 * Toàn website chỉ có 01 component popup duy nhất. Nội dung của từng popup
 * được lưu trong `admin_site_settings` (key = "feature_popups") dưới dạng JSON
 * và chỉnh hoàn toàn từ Admin Panel → "Quản lý Popup".
 *
 * Đọc: RPC get_site_setting('feature_popups')  (anon đọc được)
 * Ghi: RPC admin_set_site_setting('feature_popups', ...) (chỉ admin)
 *
 * Thêm tính năng mới = thêm 1 popup_key, KHÔNG cần viết component mới.
 */
import { supabase } from "@/integrations/supabase/client";
import { adminSetSiteSetting } from "@/lib/admin-db";

const SETTING_KEY = "feature_popups";

export type PopupEffect =
  | "fade"
  | "scale"
  | "zoom"
  | "slide"
  | "letter"
  | "unlock"
  | "game"
  | "3d";

export type PopupTheme =
  | "gradient"
  | "pink"
  | "purple"
  | "blue"
  | "dark"
  | "glass"
  | "gold";

export interface FeaturePopupConfig {
  /** popup_key — định danh dùng trong openPopup("vip_zalo") */
  key: string;
  /** Tên hiển thị trong Admin Panel */
  label: string;
  title: string;
  icon: string;
  /** URL ảnh minh họa (PNG/JPG/WEBP) */
  imageUrl: string;
  content: string;
  leftText: string;
  rightText: string;
  rightUrl: string;
  effect: PopupEffect;
  theme: PopupTheme;
  enabled: boolean;
  /** Điều kiện hiển thị (mô tả, dùng cho admin ghi chú) */
  condition: string;
  /** Danh sách quyền lợi hiển thị dạng ✔ (mỗi dòng 1 mục). */
  benefits: string[];
  /** Màu nút chính (CSS color / gradient). Bỏ trống = mặc định theo theme. */
  buttonColor: string;
}

/** Liên kết dùng chung toàn hệ thống — chỉnh trong Admin Panel. */
export interface PopupLinks {
  facebook: string;
  zalo: string;
  telegram: string;
  fanpage: string;
  zaloGroup: string;
}

export const DEFAULT_LINKS: PopupLinks = {
  facebook: "",
  zalo: "",
  telegram: "",
  fanpage: "",
  zaloGroup: "",
};

/** Quyền lợi VIP mặc định (dùng cho popup + thẻ VIP nổi cạnh tên). */
export const DEFAULT_VIP_BENEFITS = [
  "Kết bạn Zalo",
  "Xem số Zalo",
  "Vào nhóm VIP",
  "Hỗ trợ trực tiếp",
  "Set kèo miễn phí",
  "Offline cuối tháng",
];

export const POPUP_ICONS = ["🔒", "👑", "💎", "💌", "🦋", "⭐", "❤️", "📢"];

export const POPUP_EFFECTS: { value: PopupEffect; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "scale", label: "Scale" },
  { value: "zoom", label: "Zoom" },
  { value: "slide", label: "Slide" },
  { value: "letter", label: "Lá thư" },
  { value: "unlock", label: "Mở khóa" },
  { value: "game", label: "Game Unlock" },
  { value: "3d", label: "3D Popup" },
];

export const POPUP_THEMES: { value: PopupTheme; label: string }[] = [
  { value: "gradient", label: "Gradient" },
  { value: "pink", label: "Hồng" },
  { value: "purple", label: "Tím" },
  { value: "blue", label: "Xanh" },
  { value: "dark", label: "Dark" },
  { value: "glass", label: "Glass" },
  { value: "gold", label: "Vàng" },
];

function make(
  key: string,
  label: string,
  icon: string,
  title: string,
  content: string,
  theme: PopupTheme,
  effect: PopupEffect,
  condition: string,
  rightText = "Liên hệ Admin",
): FeaturePopupConfig {
  return {
    key,
    label,
    icon,
    title,
    content,
    imageUrl: "",
    leftText: "Đóng",
    rightText,
    rightUrl: "",
    effect,
    theme,
    enabled: true,
    condition,
    benefits: [...DEFAULT_VIP_BENEFITS],
    buttonColor: "",
  };
}

/** Danh sách popup mặc định của hệ thống. */
export const DEFAULT_POPUPS: FeaturePopupConfig[] = [
  make("zalo_friend", "Kết bạn Zalo", "💌", "Kết Bạn Zalo",
    "Bạn cần tham gia Cộng Đồng VIP để mở khóa tính năng Kết bạn Zalo.",
    "blue", "letter", "Chưa vào VIP", "Tham gia ngay"),
  make("live_moc", "Live Mộc 🦋", "🦋", "Live Mộc 🦋",
    "Tính năng Live Mộc chỉ dành cho thành viên đã tham gia Cộng Đồng VIP.",
    "purple", "zoom", "Chưa vào VIP"),
  make("vip_zalo", "Cộng đồng VIP", "👑", "Cộng Đồng VIP Zalo",
    "Bạn chưa tham gia Cộng Đồng VIP. Tham gia để mở khóa toàn bộ tính năng.",
    "gold", "unlock", "Chưa vào VIP", "Tham gia VIP"),
  make("phone_view", "Xem số điện thoại", "🔒", "Xem Số Điện Thoại",
    "Số điện thoại chỉ hiển thị với thành viên VIP đã xác minh.",
    "dark", "unlock", "Chưa xác minh"),
  make("unlock_image", "Mở khóa ảnh", "🔒", "Mở Khóa Ảnh",
    "Ảnh này đã được khóa. Mở khóa để xem toàn bộ album.",
    "glass", "game", "Hết lượt miễn phí", "Mở khóa"),
  make("unlock_video", "Mở khóa video", "🔒", "Mở Khóa Video",
    "Video này chỉ dành cho thành viên VIP. Mở khóa để xem ngay.",
    "glass", "game", "Hết lượt miễn phí", "Mở khóa"),
  make("fanpage", "Theo dõi Fanpage", "📢", "Theo Dõi Fanpage",
    "Hãy theo dõi Fanpage để nhận thông báo sự kiện và quà tặng mới nhất.",
    "blue", "slide", "Chưa Follow Fanpage", "Theo dõi Fanpage"),
  make("facebook_admin", "Kết bạn Facebook Admin", "❤️", "Kết Bạn Facebook Admin",
    "Kết bạn với Facebook Admin để được hỗ trợ nhanh nhất.",
    "pink", "scale", "Chưa kết bạn Admin", "Kết bạn Admin"),
  make("premium", "Tính năng Premium", "💎", "Tính Năng Premium",
    "Tính năng này thuộc gói Premium. Nâng cấp để sử dụng không giới hạn.",
    "gradient", "3d", "Chưa Premium", "Nâng cấp Premium"),
  make("gift", "Quà tặng", "⭐", "Quà Tặng",
    "Bạn có một phần quà đang chờ nhận. Nhận ngay hôm nay nhé!",
    "gold", "zoom", "Có quà chưa nhận", "Nhận quà"),
  make("event", "Sự kiện", "⭐", "Sự Kiện Đặc Biệt",
    "Sự kiện lớn nhất tháng đã bắt đầu. Tham gia ngay để nhận quà hấp dẫn!",
    "purple", "zoom", "Sự kiện đang diễn ra", "Tham gia"),
  make("vip_card", "Thẻ VIP cạnh tên", "👑", "THÀNH VIÊN VIP",
    "⭐ Đã tham gia nhóm VIP", "gold", "scale", "Bấm vào GIF VIP cạnh tên", "Vĩnh viễn"),
  make("set_keo", "Set kèo", "⭐", "Set Kèo Miễn Phí",
    "Tính năng Set kèo chỉ dành cho thành viên Cộng Đồng VIP.",
    "purple", "unlock", "Chưa vào VIP"),
  make("offline", "Offline cuối tháng", "❤️", "Offline Cuối Tháng",
    "Sự kiện Offline cuối tháng dành riêng cho thành viên VIP.",
    "pink", "zoom", "Chưa vào VIP"),
  make("system_notice", "Thông báo hệ thống", "📢", "Thông Báo Hệ Thống",
    "Hệ thống vừa có cập nhật mới. Vui lòng xem chi tiết bên dưới.",
    "dark", "fade", "Luôn hiển thị khi gọi", "Xem chi tiết"),
];

export function defaultPopup(key: string): FeaturePopupConfig {
  return (
    DEFAULT_POPUPS.find((p) => p.key === key) ??
    make(key, key, "📢", "Thông báo", "", "gradient", "fade", "")
  );
}

function normalizeLinks(raw: unknown): PopupLinks {
  const r = (raw ?? {}) as Partial<PopupLinks>;
  return { ...DEFAULT_LINKS, ...r };
}

function normalize(raw: unknown): FeaturePopupConfig[] {
  const list = Array.isArray(raw) ? raw : [];
  const byKey = new Map<string, FeaturePopupConfig>();
  for (const d of DEFAULT_POPUPS) byKey.set(d.key, { ...d });
  for (const r of list) {
    const item = r as Partial<FeaturePopupConfig>;
    if (!item?.key) continue;
    const base = byKey.get(item.key) ?? defaultPopup(item.key);
    byKey.set(item.key, {
      ...base,
      ...item,
      key: item.key,
      benefits: Array.isArray(item.benefits) ? item.benefits : base.benefits,
      buttonColor: item.buttonColor ?? base.buttonColor ?? "",
    });
  }
  return Array.from(byKey.values());
}

export interface PopupSettings {
  items: FeaturePopupConfig[];
  links: PopupLinks;
}

/** Tải toàn bộ cấu hình popup + liên kết (public read, 1 truy vấn duy nhất). */
export async function loadPopupSettings(): Promise<PopupSettings> {
  try {
    const { data, error } = await (supabase as any).rpc("get_site_setting", {
      _key: SETTING_KEY,
    });
    if (error) throw error;
    return {
      items: normalize((data as any)?.items),
      links: normalizeLinks((data as any)?.links),
    };
  } catch {
    return { items: DEFAULT_POPUPS.map((p) => ({ ...p })), links: { ...DEFAULT_LINKS } };
  }
}

/** Tải toàn bộ cấu hình popup (public read). */
export async function loadFeaturePopups(): Promise<FeaturePopupConfig[]> {
  return (await loadPopupSettings()).items;
}

/** Lưu toàn bộ cấu hình popup (chỉ admin). */
export async function saveFeaturePopups(
  items: FeaturePopupConfig[],
  links?: PopupLinks,
) {
  await adminSetSiteSetting(SETTING_KEY, { items, links: links ?? DEFAULT_LINKS });
}
