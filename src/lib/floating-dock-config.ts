/**
 * Floating Dock — cấu hình (site setting key: `floating_dock`).
 * Đọc: get_site_setting (public) · Ghi: adminSetSiteSetting (admin).
 */
import { getSiteSetting, adminSetSiteSetting } from "@/lib/admin-db";

export const FLOATING_DOCK_KEY = "floating_dock";
export const FLOATING_DOCK_EVENT = "floating-dock:changed";

export type DockItemId = "facebook" | "zalo" | "gamexu" | "follow";

/** Nút bấm trong popup — Admin tự cấu hình hoàn toàn. */
export type DockButtonCfg = {
  enabled: boolean;
  label: string;
  url: string;
  color: string;
};

export type FacebookCfg = {
  enabled: boolean;
  name: string;
  url: string;
  avatar: string;
  icon: string;
  color: string;
  /** Tiêu đề popup */
  popupTitle: string;
  btn1: DockButtonCfg;
  btn2: DockButtonCfg;
};

export type ZaloCfg = {
  enabled: boolean;
  mode: "chat" | "group" | "both";
  name: string;
  chatUrl: string;
  groupUrl: string;
  avatar: string;
  qr: string;
  icon: string;
  color: string;
  popupTitle: string;
  btn1: DockButtonCfg;
  btn2: DockButtonCfg;
};

export type GameXuCfg = {
  enabled: boolean;
  label: string;
  icon: string;
  color: string;
};

/** Icon "Theo dõi" — chỉ bật/tắt, icon riêng, kích thước, vị trí (thứ tự). */
export type FollowCfg = {
  enabled: boolean;
  label: string;
  icon: string;
  /** Kích thước ô icon (px) */
  size: number;
};

export type DockCfg = {
  enabled: boolean;
  visible: boolean;
  /** Độ mờ khi cuộn trang (%) */
  idleOpacity: number;
  /** Hiệu ứng nền của icon */
  effect: "glow" | "pulse" | "none";
  /** Hiệu ứng nhảy nhẹ lần lượt để thu hút click */
  attention: boolean;
  /** Vị trí dọc mặc định (% chiều cao màn hình) */
  defaultY: number;
  order: DockItemId[];
  facebook: FacebookCfg;
  zalo: ZaloCfg;
  gamexu: GameXuCfg;
  follow: FollowCfg;
};

export const DOCK_DEFAULT: DockCfg = {
  enabled: true,
  visible: true,
  idleOpacity: 35,
  effect: "glow",
  attention: true,
  defaultY: 50,
  order: ["facebook", "zalo", "gamexu", "follow"],
  facebook: {
    enabled: true,
    name: "Fanpage",
    url: "",
    avatar: "",
    icon: "",
    color: "#1877f2",
    popupTitle: "Liên hệ Fanpage",
    btn1: { enabled: true, label: "👍 Liên hệ Admin", url: "", color: "#1877f2" },
    btn2: { enabled: false, label: "👥 Tham gia Group Facebook", url: "", color: "#2f8f4e" },
  },
  zalo: {
    enabled: true,
    mode: "both",
    name: "Zalo",
    chatUrl: "",
    groupUrl: "",
    avatar: "",
    qr: "",
    icon: "",
    color: "#0068ff",
    popupTitle: "Liên hệ Zalo",
    btn1: { enabled: true, label: "💬 Liên hệ Admin", url: "", color: "#0068ff" },
    btn2: { enabled: false, label: "👥 Tham gia Nhóm Zalo", url: "", color: "#2f8f4e" },
  },
  gamexu: { enabled: true, label: "Game Xu", icon: "", color: "#f5b301" },
  follow: { enabled: true, label: "Theo dõi", icon: "", size: 54 },
};

function normBtn(raw: unknown, fallback: DockButtonCfg, fallbackUrl = ""): DockButtonCfg {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<DockButtonCfg>;
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : fallback.enabled,
    label: typeof src.label === "string" && src.label ? src.label : fallback.label,
    url: typeof src.url === "string" && src.url ? src.url : fallbackUrl,
    color: typeof src.color === "string" && src.color ? src.color : fallback.color,
  };
}

export function normalizeDockCfg(raw: unknown): DockCfg {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<DockCfg>;
  const order = Array.isArray(src.order)
    ? (src.order.filter(
        (x) => x === "facebook" || x === "zalo" || x === "gamexu" || x === "follow",
      ) as DockItemId[])
    : [];
  for (const id of DOCK_DEFAULT.order) if (!order.includes(id)) order.push(id);

  const fbSrc = (src.facebook ?? {}) as Partial<FacebookCfg>;
  const zaSrc = (src.zalo ?? {}) as Partial<ZaloCfg>;

  return {
    enabled: src.enabled ?? DOCK_DEFAULT.enabled,
    visible: src.visible ?? DOCK_DEFAULT.visible,
    idleOpacity: Number.isFinite(Number(src.idleOpacity))
      ? Math.min(100, Math.max(10, Number(src.idleOpacity)))
      : DOCK_DEFAULT.idleOpacity,
    effect: src.effect === "pulse" || src.effect === "none" ? src.effect : "glow",
    attention: typeof src.attention === "boolean" ? src.attention : DOCK_DEFAULT.attention,
    defaultY: Number.isFinite(Number(src.defaultY))
      ? Math.min(90, Math.max(10, Number(src.defaultY)))
      : DOCK_DEFAULT.defaultY,
    order,
    facebook: {
      ...DOCK_DEFAULT.facebook,
      ...fbSrc,
      popupTitle: fbSrc.popupTitle || fbSrc.name || DOCK_DEFAULT.facebook.popupTitle,
      btn1: normBtn(fbSrc.btn1, DOCK_DEFAULT.facebook.btn1, fbSrc.url ?? ""),
      btn2: normBtn(fbSrc.btn2, DOCK_DEFAULT.facebook.btn2),
    },
    zalo: {
      ...DOCK_DEFAULT.zalo,
      ...zaSrc,
      popupTitle: zaSrc.popupTitle || zaSrc.name || DOCK_DEFAULT.zalo.popupTitle,
      btn1: normBtn(zaSrc.btn1, DOCK_DEFAULT.zalo.btn1, zaSrc.chatUrl ?? ""),
      btn2: normBtn(
        zaSrc.btn2,
        { ...DOCK_DEFAULT.zalo.btn2, enabled: !!zaSrc.groupUrl },
        zaSrc.groupUrl ?? "",
      ),
    },
    gamexu: { ...DOCK_DEFAULT.gamexu, ...(src.gamexu ?? {}) },
    follow: {
      ...DOCK_DEFAULT.follow,
      ...((src.follow ?? {}) as Partial<FollowCfg>),
      size: Math.min(
        88,
        Math.max(36, Number((src.follow as Partial<FollowCfg> | undefined)?.size) || DOCK_DEFAULT.follow.size),
      ),
    },
  };
}

export async function loadDockCfg(): Promise<DockCfg> {
  try {
    const raw = await getSiteSetting<DockCfg>(FLOATING_DOCK_KEY);
    return normalizeDockCfg(raw);
  } catch {
    return DOCK_DEFAULT;
  }
}

export async function saveDockCfg(cfg: DockCfg): Promise<void> {
  await adminSetSiteSetting(FLOATING_DOCK_KEY, normalizeDockCfg(cfg));
  try {
    window.dispatchEvent(new CustomEvent(FLOATING_DOCK_EVENT));
  } catch {
    /* noop */
  }
}
