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
import { supabase } from "@/integrations/supabase/client";
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

export interface VipUnlockConfig {
  title: string;
  message: string;
  benefits: string[];
  icon: string;
  buttonLabel: string;
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
  title: "MỞ KHÓA TÍNH NĂNG",
  message: "Tài khoản của bạn hiện chưa thể sử dụng tính năng này.",
  benefits: [
    "Gọi Voice",
    "Video Call",
    "Live",
    "Kết bạn Zalo",
    "Xem số Zalo",
    "Hỗ trợ trực tiếp từ Admin",
  ],
  icon: "lock",
  buttonLabel: "Liên hệ Admin",
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
let subscribed = false;

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
  return {
    title: (typeof v.title === "string" && v.title.trim()) || d.title,
    message: (typeof v.message === "string" && v.message.trim()) || d.message,
    benefits: benefits.length ? benefits : d.benefits,
    icon: (typeof v.icon === "string" && v.icon.trim()) || d.icon,
    buttonLabel: (typeof v.buttonLabel === "string" && v.buttonLabel.trim()) || d.buttonLabel,
    link: typeof v.link === "string" ? v.link.trim() : "",
    variants,
  };
}

function subscribeRealtime() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  try {
    (supabase as any)
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
    window.addEventListener(EVENT, load);
    window.addEventListener("admin-contact-url-changed", load);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, load);
      window.removeEventListener("admin-contact-url-changed", load);
    };
  }, []);

  return cfg;
}
