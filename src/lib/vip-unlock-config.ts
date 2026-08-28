/**
 * NGUỒN DỮ LIỆU DUY NHẤT cho popup "Mở khoá tính năng VIP" của toàn website.
 *
 * Tất cả popup (Live, Gọi thoại, Gọi video, Kết bạn Zalo, Xem số Zalo…) đều
 * dùng chung component VipUnlockModal + cấu hình này.
 *
 * Lưu trong `admin_site_settings.key = 'vip_unlock_popup'`.
 * Link "Liên hệ Admin" ưu tiên cấu hình ở đây, fallback về vip_contact_link cũ.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/db/router";
import { fetchVipUnlockLink, invalidateVipUnlockLink } from "@/lib/vip-unlock-link";
import { adminSetSiteSetting } from "@/lib/admin-db";


export const VIP_POPUP_SETTING_KEY = "vip_unlock_popup";
const EVENT = "vip-unlock-config-changed";

export type VipVariantKey = "default" | "voice" | "video" | "live" | "zalo" | "phone";

export const VIP_VARIANT_LABELS: Record<VipVariantKey, string> = {
  default: "Mặc định",
  voice: "📞 Gọi thoại",
  video: "🎥 Gọi video",
  live: "🎥 Live",
  zalo: "❤️ Kết bạn Zalo",
  phone: "📱 Xem số Zalo",
};

export interface VipVariantConfig {
  title?: string;
  message?: string;
  icon?: string;
}

export interface VipFeatureItem {
  icon: string;
  title: string;
  subtitle: string;
}

export interface VipUnlockConfig {
  /** Ảnh/GIF header hiển thị trên cùng popup (URL hoặc data:image). */
  headerMedia: string;
  /** Khu vực mặc định khi thành viên chưa chọn khu vực. */
  defaultLocation: string;
  /** Danh sách feature items (icon + tiêu đề + mô tả nhỏ). */
  features: VipFeatureItem[];
  title: string;
  message: string;
  benefits: string[];
  icon: string;
  buttonLabel: string;
  buttonColor: string;
  link: string;
  variants: Record<VipVariantKey, VipVariantConfig>;
}

export const VIP_ICON_KEYS = [
  "lock",
  "phone",
  "video",
  "heart",
  "radio",
  "sparkles",
  "message",
  "crown",
] as const;

export const DEFAULT_VIP_UNLOCK_CONFIG: VipUnlockConfig = {
  headerMedia: "",
  defaultLocation: "Toàn Quốc",
  features: [
    { icon: "💬", title: "Kết bạn Zalo", subtitle: "Nhắn tin trực tiếp không giới hạn" },
    { icon: "📱", title: "Xem số Zalo", subtitle: "Hiển thị số điện thoại thành viên" },
    { icon: "🎙️", title: "Voice & Video Call", subtitle: "Gọi thoại, gọi video chất lượng cao" },
    { icon: "🎥", title: "Live Móc", subtitle: "Xem live riêng tư cùng thành viên VIP" },
  ],
  title: "Cộng Đồng Zalo Khu Vực {location}",
  message: "Bạn chưa tham gia Cộng Đồng VIP Zalo.\nTham gia để mở khóa:",
  benefits: [
    "Kết bạn Zalo",
    "Xem số Zalo",
    "Voice Call",
    "Video Call",
    "Live Móc",
    "Hỗ trợ Admin",
  ],
  icon: "🔒",
  buttonLabel: "Liên Hệ Admin",
  buttonColor: "#2563eb",
  link: "",
  variants: {
    default: {},
    voice: { title: "MỞ KHÓA TÍNH NĂNG", icon: "phone" },
    video: { title: "MỞ KHÓA TÍNH NĂNG", icon: "video" },
    live: { title: "MỞ KHÓA TÍNH NĂNG", icon: "radio" },
    zalo: { title: "MỞ KHÓA TÍNH NĂNG", icon: "heart" },
    phone: { title: "MỞ KHÓA TÍNH NĂNG", icon: "message" },
  },
};

let cached: VipUnlockConfig | null = null;
let inflight: Promise<VipUnlockConfig> | null = null;


function normalize(raw: unknown): VipUnlockConfig {
  const d = DEFAULT_VIP_UNLOCK_CONFIG;
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const benefits = Array.isArray(v.benefits)
    ? v.benefits.map((b: unknown) => String(b || "").trim()).filter(Boolean)
    : d.benefits;
  const variantsRaw = (v.variants && typeof v.variants === "object" ? v.variants : {}) as Record<string, any>;
  const variants = {} as Record<VipVariantKey, VipVariantConfig>;
  (Object.keys(d.variants) as VipVariantKey[]).forEach((k) => {
    const src = (variantsRaw[k] || {}) as Record<string, any>;
    variants[k] = {
      title: typeof src.title === "string" ? src.title : d.variants[k].title,
      message: typeof src.message === "string" ? src.message : d.variants[k].message,
      icon: typeof src.icon === "string" ? src.icon : d.variants[k].icon,
    };
  });
  const features: VipFeatureItem[] = Array.isArray(v.features)
    ? (v.features as any[])
        .map((f) => ({
          icon: String(f?.icon ?? "").trim(),
          title: String(f?.title ?? "").trim(),
          subtitle: String(f?.subtitle ?? "").trim(),
        }))
        .filter((f) => f.title || f.subtitle)
    : benefits.map((b) => ({ icon: "✨", title: b, subtitle: "" }));
  return {
    headerMedia: typeof v.headerMedia === "string" ? v.headerMedia.trim() : "",
    defaultLocation:
      (typeof v.defaultLocation === "string" && v.defaultLocation.trim()) || d.defaultLocation,
    features: features.length ? features : d.features,
    title: (typeof v.title === "string" && v.title.trim()) || d.title,
    message: (typeof v.message === "string" && v.message.trim()) || d.message,
    benefits: benefits.length ? benefits : d.benefits,
    icon: (typeof v.icon === "string" && v.icon.trim()) || d.icon,
    buttonLabel: (typeof v.buttonLabel === "string" && v.buttonLabel.trim()) || d.buttonLabel,
    buttonColor: (typeof v.buttonColor === "string" && v.buttonColor.trim()) || d.buttonColor,
    link: typeof v.link === "string" ? v.link.trim() : "",
    variants,
  };
}

let channelRef: any = null;
let listeners = 0;

/** Mở realtime (chỉ 1 channel dùng chung). */
function subscribeRealtime() {
  if (channelRef || typeof window === "undefined") return;
  try {
    channelRef = (supabase as any)
      .channel("vip-unlock-config")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_site_settings" },
        () => invalidateVipUnlockConfig(),
      )
      .subscribe();
  } catch {
    /* realtime optional */
  }
}

/** Đóng channel khi không còn component nào lắng nghe / rời tab. */
function unsubscribeRealtime() {
  if (!channelRef) return;
  try {
    (supabase as any).removeChannel(channelRef);
  } catch {
    try {
      channelRef.unsubscribe?.();
    } catch {
      /* ignore */
    }
  }
  channelRef = null;
}


export async function fetchVipUnlockConfig(): Promise<VipUnlockConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    let cfg = DEFAULT_VIP_UNLOCK_CONFIG;
    try {
      const { data } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", VIP_POPUP_SETTING_KEY)
        .maybeSingle();
      cfg = normalize(data?.value);
    } catch {
      cfg = normalize(null);
    }
    if (!cfg.link) {
      try {
        cfg = { ...cfg, link: await fetchVipUnlockLink() };
      } catch {
        /* noop */
      }
    }
    cached = cfg;
    inflight = null;
    subscribeRealtime();
    return cfg;
  })();
  return inflight;
}

export function invalidateVipUnlockConfig() {
  cached = null;
  invalidateVipUnlockLink();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

export async function saveVipUnlockConfig(cfg: VipUnlockConfig): Promise<void> {
  const value = normalize(cfg);
  // Đường ghi DUY NHẤT: RPC SECURITY DEFINER (không đụng RLS).
  await adminSetSiteSetting(VIP_POPUP_SETTING_KEY, value);
  // Giữ đồng bộ các key cũ để mọi nơi dùng chung một link duy nhất.
  if (value.link) {
    try {
      await adminSetSiteSetting("vip_contact_link", { url: value.link });
      await adminSetSiteSetting("admin_contact_url", { url: value.link });
    } catch {
      /* link phụ không chặn việc lưu popup */
    }
  }
  invalidateVipUnlockConfig();
}


/** Cấu hình đã áp dụng biến thể (title/message/icon riêng, phần còn lại dùng chung). */
export interface ResolvedVipPopup {
  title: string;
  message: string;
  benefits: string[];
  icon: string;
  buttonLabel: string;
  link: string;
}

export function resolveVariant(cfg: VipUnlockConfig, variant: VipVariantKey = "default"): ResolvedVipPopup {
  const v = cfg.variants?.[variant] || {};
  return {
    title: (v.title || "").trim() || cfg.title,
    message: (v.message || "").trim() || cfg.message,
    icon: (v.icon || "").trim() || cfg.icon,
    benefits: cfg.benefits,
    buttonLabel: cfg.buttonLabel,
    link: cfg.link,
  };
}

export function useVipUnlockConfig(): VipUnlockConfig {
  const [cfg, setCfg] = useState<VipUnlockConfig>(cached || DEFAULT_VIP_UNLOCK_CONFIG);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchVipUnlockConfig().then((c) => alive && setCfg(c));
    };
    load();
    listeners += 1;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") unsubscribeRealtime();
      else if (listeners > 0) subscribeRealtime();
    };
    window.addEventListener(EVENT, load);
    window.addEventListener("admin-contact-url-changed", load);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      listeners = Math.max(0, listeners - 1);
      window.removeEventListener(EVENT, load);
      window.removeEventListener("admin-contact-url-changed", load);
      document.removeEventListener("visibilitychange", onVisibility);
      if (listeners === 0) unsubscribeRealtime();
    };
  }, []);


  return cfg;
}

/** Thay biến {location} trong tiêu đề bằng khu vực của thành viên. */
export function renderPopupTitle(template: string, location?: string | null, fallback?: string): string {
  const area = (location || "").trim() || (fallback || "").trim() || DEFAULT_VIP_UNLOCK_CONFIG.defaultLocation;
  return String(template || "").replace(/\{location\}/gi, area);
}

/**
 * renderLocationText — thay TẤT CẢ biến {location} trong một đoạn văn bản bất kỳ
 * (tiêu đề, nội dung, feature items, nút bấm…) bằng khu vực của thành viên.
 * Nếu thành viên chưa có khu vực → dùng defaultLocation (Khu vực mặc định).
 */
export function renderLocationText(text: string, userLocation?: string | null, defaultLocation?: string): string {
  return renderPopupTitle(text, userLocation, defaultLocation);
}
