/**
 * Sticker trang cá nhân — thư viện dùng chung (GIF / PNG / APNG / WebP).
 *
 * KHÔNG tạo bảng mới: toàn bộ cấu hình nằm trong `admin_site_settings`
 * key = `profile_stickers`:
 *   { items: ProfileSticker[], assign: { [userId]: stickerId[] } }
 *
 * Mỗi user chỉ lưu MẢNG ID → không nhân bản dữ liệu, storage gần như không tăng.
 * Đọc 1 lần rồi cache trong module (không realtime, không polling).
 */
import { getSiteSetting, adminSetSiteSetting } from "@/lib/admin-db";

export const PROFILE_STICKERS_KEY = "profile_stickers";
export const PROFILE_STICKERS_EVENT = "profile-stickers:changed";

export type StickerPos =
  | "random"
  | "top-left"
  | "top-right"
  | "left"
  | "right"
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "top";

export type ProfileSticker = {
  id: string;
  name: string;
  url: string;
  /** Độ sáng glow 0–100 (0 = tắt) */
  glow: number;
  /** Tỉ lệ 0.3 – 2.5 */
  scale: number;
  /** Lệch ngang / dọc (px) */
  offsetX: number;
  offsetY: number;
  pos: StickerPos;
  enabled: boolean;
};

export type ProfileStickerCfg = {
  items: ProfileSticker[];
  assign: Record<string, string[]>;
};

/** Số sticker tối đa mỗi tài khoản. */
export const MAX_PROFILE_STICKERS = 5;

export const EMPTY_STICKER_CFG: ProfileStickerCfg = { items: [], assign: {} };

export function newSticker(partial?: Partial<ProfileSticker>): ProfileSticker {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "Sticker mới",
    url: "",
    glow: 40,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    pos: "random",
    enabled: true,
    ...partial,
  };
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function normalizeStickerCfg(raw: any): ProfileStickerCfg {
  const items: ProfileSticker[] = Array.isArray(raw?.items)
    ? raw.items
        .filter((it: any) => it && typeof it.url === "string")
        .map((it: any) =>
          newSticker({
            id: String(it.id ?? ""),
            name: String(it.name ?? "Sticker"),
            url: String(it.url ?? ""),
            glow: num(it.glow, 40, 0, 100),
            scale: num(it.scale, 1, 0.3, 2.5),
            offsetX: num(it.offsetX, 0, -200, 200),
            offsetY: num(it.offsetY, 0, -200, 200),
            pos: (it.pos ?? "random") as StickerPos,
            enabled: it.enabled !== false,
          }),
        )
        .map((it: ProfileSticker) => (it.id ? it : newSticker(it)))
    : [];

  const assign: Record<string, string[]> = {};
  const rawAssign = raw?.assign;
  if (rawAssign && typeof rawAssign === "object") {
    for (const [uid, ids] of Object.entries(rawAssign)) {
      if (Array.isArray(ids)) {
        const list = ids.map(String).filter(Boolean);
        if (list.length) assign[uid] = list;
      }
    }
  }
  return { items, assign };
}

// ---------------------------------------------------------------- cache ----
let cache: ProfileStickerCfg | null = null;
let inflight: Promise<ProfileStickerCfg> | null = null;

/** Cấu hình đã cache (đồng bộ) — dùng cho render đầu tiên. */
export function getCachedStickerCfg(): ProfileStickerCfg | null {
  return cache;
}

/** Đọc cấu hình (cache toàn app, không tải lại khi đổi trang). */
export function loadStickerCfg(force = false): Promise<ProfileStickerCfg> {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = getSiteSetting<any>(PROFILE_STICKERS_KEY)
    .then((raw) => {
      cache = normalizeStickerCfg(raw);
      return cache;
    })
    .catch(() => {
      cache = cache ?? EMPTY_STICKER_CFG;
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function saveStickerCfg(cfg: ProfileStickerCfg): Promise<void> {
  const clean = normalizeStickerCfg(cfg);
  await adminSetSiteSetting(PROFILE_STICKERS_KEY, clean);
  cache = clean;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_STICKERS_EVENT));
  }
}

/** Gán / bỏ gán sticker cho 1 user (chỉ lưu ID). */
export async function saveUserStickers(userId: string, stickerIds: string[]): Promise<void> {
  const cfg = await loadStickerCfg();
  const assign = { ...cfg.assign };
  const list = Array.from(new Set(stickerIds)).slice(0, MAX_PROFILE_STICKERS);
  if (list.length) assign[userId] = list;
  else delete assign[userId];
  await saveStickerCfg({ ...cfg, assign });
}

/** Sticker đang bật của 1 user, theo thứ tự trong thư viện. */
export function stickersForUser(cfg: ProfileStickerCfg | null, userId?: string | null): ProfileSticker[] {
  if (!cfg || !userId) return [];
  const ids = new Set(cfg.assign[userId] ?? []);
  if (!ids.size) return [];
  return cfg.items.filter((s) => s.enabled && s.url && ids.has(s.id)).slice(0, MAX_PROFILE_STICKERS);
}

/**
 * Đảm bảo có bản ghi style cho 1 media VIP (id = id của media trong kho Icon VIP).
 * Chỉ lưu id + url tham chiếu — không nhân bản file, không tạo kho mới.
 */
export async function ensureStickerFromVipIcon(icon: { id: string; name?: string | null; url: string }): Promise<string> {
  const cfg = await loadStickerCfg();
  const found = cfg.items.find((s) => s.id === icon.id);
  if (found && found.url === icon.url) return found.id;
  const item = newSticker({ id: icon.id, url: icon.url, name: icon.name || "Sticker VIP" });
  const items = found
    ? cfg.items.map((s) => (s.id === icon.id ? { ...s, url: icon.url } : s))
    : [...cfg.items, item];
  await saveStickerCfg({ ...cfg, items });
  return icon.id;
}

/**
 * Đảm bảo có 1 sticker trong thư viện ứng với URL (dùng cho Kho GIF).
 * Trả về sticker_id để gán cho user — không nhân bản dữ liệu.
 */
export async function ensureStickerFromUrl(url: string, name = "Sticker"): Promise<string> {
  const cfg = await loadStickerCfg();
  const found = cfg.items.find((s) => s.url === url);
  if (found) return found.id;
  const item = newSticker({ url, name });
  await saveStickerCfg({ ...cfg, items: [...cfg.items, item] });
  return item.id;
}

/** Tước toàn bộ sticker hồ sơ của nhiều tài khoản (không đụng kho Icon VIP). */
export async function clearUsersStickers(userIds: string[]): Promise<number> {
  const cfg = await loadStickerCfg(true);
  const assign = { ...cfg.assign };
  let n = 0;
  for (const id of userIds) {
    if (assign[id]) { delete assign[id]; n++; }
  }
  if (n) await saveStickerCfg({ ...cfg, assign });
  return n;
}
