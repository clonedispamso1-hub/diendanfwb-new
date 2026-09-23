/**
 * COMMUNITY VIP theo KHU VỰC (Tỉnh/Thành phố) — sinh ĐÚNG 1 LẦN rồi lưu vĩnh viễn.
 *
 * - Tên nhóm dùng biến {LOCATION} → "Cộng Đồng Zalo TP. Hồ Chí Minh 1".
 * - Đúng 8 nhóm; mỗi nhóm random 1 quận/huyện thuộc tỉnh/thành đó.
 * - Số thành viên / Nam / Nữ / Admin / Key vàng / Key bạc cố định sau khi tạo.
 * - Avatar dùng chung LOGO ZALO có sẵn trong Kho ảnh Zalo/LINE (không upload mới).
 * - Lưu trong bảng có sẵn public.admin_site_settings (key "crm_community_vip_sets"),
 *   KHÔNG tạo bảng/migration mới.
 */
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { getDistricts } from "@/lib/vn-locations";
import { listZaloMedia } from "@/lib/zalo-sub-items";
import { toProvince } from "@/lib/crm-guide-regions";

const DB_KEY = "crm_community_vip_sets";
const CACHE_KEY = "crm.community.vip.sets.v1";
const CONFIG_DB_KEY = "crm_community_vip_config";
const CONFIG_CACHE_KEY = "crm.community.vip.config.v1";

/** Số nhóm mỗi tỉnh/thành: random 1 lần trong khoảng 8 → 15 rồi lưu cố định. */
export const COMMUNITY_VIP_MIN_COUNT = 8;
export const COMMUNITY_VIP_MAX_COUNT = 15;
/** @deprecated giữ để tương thích code cũ. */
export const COMMUNITY_VIP_COUNT = COMMUNITY_VIP_MIN_COUNT;
export const MAX_GOLD_KEY = 1;
export const MAX_SILVER_KEY = 3;

export interface CommunityVipGroup {
  /** Mẫu tên có biến {LOCATION}: "Cộng Đồng Zalo {LOCATION} 1". */
  name_template: string;
  /** Quận/huyện được random cho nhóm này. */
  district: string;
  members: number;
  men: number;
  women: number;
  admins: number;
  gold_key: number;
  silver_key: number;
}

export interface CommunityVipSet {
  province: string;
  avatar_url: string | null;
  groups: CommunityVipGroup[];
  created_at: string;
}

export type CommunityVipMap = Record<string, CommunityVipSet>;

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Số Admin của nhóm = Key Vàng + Key Bạc (luôn đúng, không nhập riêng). */
export function communityAdminCount(g: Pick<CommunityVipGroup, "gold_key" | "silver_key">): number {
  return Math.max(0, Number(g.gold_key) || 0) + Math.max(0, Number(g.silver_key) || 0);
}

/** Thay {LOCATION} trong tên nhóm bằng Tỉnh/Thành phố. */
export function applyLocationName(template: string, province: string): string {
  return String(template ?? "").replace(/\{\s*LOCATION\s*\}/gi, province);
}

function isMap(v: unknown): v is CommunityVipMap {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function cachedCommunityVipSets(): CommunityVipMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(map: CommunityVipMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function fetchCommunityVipSets(): Promise<CommunityVipMap> {
  let value: unknown = null;
  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: DB_KEY });
  if (!error) value = rpcData;

  if (!isMap(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }

  const map = isMap(value) ? value : {};
  writeCache(map);
  return map;
}

/** LOGO ZALO dùng chung — lấy ảnh Zalo đầu tiên trong Kho ảnh Zalo/LINE. */
export async function zaloLogoUrl(): Promise<string | null> {
  try {
    const list = await listZaloMedia();
    const zalo = list.find((m) => m.kind === "zalo") ?? list[0];
    return zalo?.url ?? null;
  } catch {
    return null;
  }
}

/** Sinh bộ 8–15 nhóm cho 1 tỉnh/thành (chỉ gọi 1 lần duy nhất rồi lưu). */
function generateSet(province: string, avatarUrl: string | null): CommunityVipSet {
  const districts = getDistricts(province).filter(Boolean);
  const generic = districts.length <= 1 || /^toàn tỉnh$/i.test(String(districts[0] ?? ""));
  const count = rnd(COMMUNITY_VIP_MIN_COUNT, COMMUNITY_VIP_MAX_COUNT);
  const pool: string[] = [];
  let numbered = 0;

  const groups: CommunityVipGroup[] = Array.from({ length: count }, (_, i) => {
    if (!pool.length) pool.push(...districts);
    const idx = rnd(0, Math.max(0, pool.length - 1));
    const district = pool.splice(idx, 1)[0] ?? province;

    // Nhóm 1 luôn mang tên tỉnh/thành; các nhóm sau mang tên quận/huyện tương ứng.
    // Tỉnh không có dữ liệu quận/huyện → đánh số theo tỉnh.
    const useDistrictName = i > 0 && !generic && !/^toàn tỉnh$/i.test(district);
    const name_template = useDistrictName
      ? `Cộng Đồng Zalo ${district}`
      : `Cộng Đồng Zalo {LOCATION} ${++numbered}`;

    const members = rnd(740, 995);
    const gold_key = members >= 1 ? MAX_GOLD_KEY : 0;
    const silver_key = Math.max(0, Math.min(MAX_SILVER_KEY, rnd(0, MAX_SILVER_KEY)));
    // Admin luôn = Key Vàng + Key Bạc (không random riêng).
    const admins = gold_key + silver_key;
    const rest = Math.max(0, members - gold_key - silver_key - admins);
    const men = Math.round(rest * 0.55);
    const women = rest - men;

    return { name_template, district, members, men, women, admins, gold_key, silver_key };
  });

  return { province, avatar_url: avatarUrl, groups, created_at: new Date().toISOString() };
}

/* ─────────────────────────── CẤU HÌNH THEO TỈNH/THÀNH ───────────────────────────
 * Nội dung phía trên + các mục Lưu ý, Admin cấu hình riêng cho từng tỉnh/thành.
 * Lưu trong public.admin_site_settings (key "crm_community_vip_config").
 */

export interface CommunityVipNote {
  id: string;
  content: string;
  order: number;
  enabled: boolean;
}

export interface CommunityVipConfig {
  /** Nội dung hiển thị phía trên danh sách nhóm; hỗ trợ biến {location}. */
  intro: string;
  notes: CommunityVipNote[];
}

export type CommunityVipConfigMap = Record<string, CommunityVipConfig>;

export const DEFAULT_COMMUNITY_VIP_INTRO =
  "Thông tin các nhóm ở {location} 2026 và tổng số admin quản lý và hỗ trợ set kèo trong nhóm";

export const emptyCommunityVipConfig = (): CommunityVipConfig => ({
  intro: DEFAULT_COMMUNITY_VIP_INTRO,
  notes: [],
});

function normalizeConfig(value: unknown): CommunityVipConfig {
  const v = (value ?? {}) as Partial<CommunityVipConfig>;
  const notes = Array.isArray(v.notes) ? v.notes : [];
  return {
    intro: typeof v.intro === "string" ? v.intro : DEFAULT_COMMUNITY_VIP_INTRO,
    notes: notes
      .map((n, i) => ({
        id: String((n as CommunityVipNote)?.id ?? `note-${i + 1}`),
        content: String((n as CommunityVipNote)?.content ?? ""),
        order: Number((n as CommunityVipNote)?.order ?? i + 1) || i + 1,
        enabled: (n as CommunityVipNote)?.enabled !== false,
      }))
      .sort((a, b) => a.order - b.order),
  };
}

function normalizeConfigMap(value: unknown): CommunityVipConfigMap {
  if (!isMap(value)) return {};
  const out: CommunityVipConfigMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    out[k] = normalizeConfig(v);
  });
  return out;
}

export function cachedCommunityVipConfigs(): CommunityVipConfigMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    return normalizeConfigMap(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function writeConfigCache(map: CommunityVipConfigMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function fetchCommunityVipConfigs(): Promise<CommunityVipConfigMap> {
  let value: unknown = null;
  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: CONFIG_DB_KEY });
  if (!error) value = rpcData;

  if (!isMap(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", CONFIG_DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }

  const map = normalizeConfigMap(value);
  writeConfigCache(map);
  return map;
}

/** Cấu hình của 1 tỉnh/thành (chưa có → mặc định). */
export function communityVipConfigFor(
  map: CommunityVipConfigMap,
  rawProvince: string,
): CommunityVipConfig {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  return map[province] ? normalizeConfig(map[province]) : emptyCommunityVipConfig();
}

/** Lưu cấu hình cho 1 tỉnh/thành (không ảnh hưởng tỉnh khác). */
export async function persistCommunityVipConfig(
  map: CommunityVipConfigMap,
  rawProvince: string,
  config: CommunityVipConfig,
): Promise<CommunityVipConfigMap> {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  if (!province) throw new Error("Chưa chọn khu vực (Tỉnh/Thành phố).");
  const next: CommunityVipConfigMap = {
    ...map,
    [province]: normalizeConfig(config),
  };
  await adminSetSiteSetting(CONFIG_DB_KEY, next);
  writeConfigCache(next);
  return next;
}

/** Các mục Lưu ý đang bật, đã sắp thứ tự, đã thay {location}. */
export function activeCommunityVipNotes(
  config: CommunityVipConfig,
  province: string,
): string[] {
  return config.notes
    .filter((n) => n.enabled && n.content.trim())
    .sort((a, b) => a.order - b.order)
    .map((n) => applyLocationName(n.content.trim(), province));
}

/**
 * Lấy bộ Community VIP của 1 tỉnh/thành.
 * Đã có → trả về nguyên bản (KHÔNG random lại). Chưa có → sinh 1 lần và lưu.
 */
export async function ensureCommunityVipSet(
  map: CommunityVipMap,
  rawProvince: string,
): Promise<{ map: CommunityVipMap; set: CommunityVipSet }> {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  if (!province) throw new Error("Chưa chọn khu vực (Tỉnh/Thành phố).");

  const existing = map[province];
  if (existing?.groups?.length) {
    // Bổ sung avatar nếu kho ảnh mới có logo (không đụng số liệu).
    if (!existing.avatar_url) {
      const url = await zaloLogoUrl();
      if (url) {
        const next: CommunityVipMap = { ...map, [province]: { ...existing, avatar_url: url } };
        await adminSetSiteSetting(DB_KEY, next);
        writeCache(next);
        return { map: next, set: next[province]! };
      }
    }
    return { map, set: existing };
  }

  const set = generateSet(province, await zaloLogoUrl());
  const next: CommunityVipMap = { ...map, [province]: set };
  await adminSetSiteSetting(DB_KEY, next);
  writeCache(next);
  return { map: next, set };
}

/** Text Copy gửi khách. */
export function communityVipSetToText(set: CommunityVipSet): string {
  const lines = [`🔥 CỘNG ĐỒNG VIP ZALO ${set.province.toUpperCase()}`, ""];
  set.groups.forEach((g) => {
    lines.push(`${applyLocationName(g.name_template, set.province)} — ${g.district}`);
    lines.push(
      `👥 ${g.members} thành viên · ♂ Nam: ${g.men} · ♀ Nữ: ${g.women} · 👑 Admin: ${communityAdminCount(g)} · 🟡 Key Vàng: ${g.gold_key} · ⚪ Key Bạc: ${g.silver_key}`,
    );
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}
