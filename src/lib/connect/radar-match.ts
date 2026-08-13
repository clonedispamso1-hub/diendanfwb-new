/**
 * Kết nối (Radar Match) — lớp dữ liệu siêu nhẹ.
 * - Không polling, không realtime: chỉ query khi người dùng bấm "Bắt đầu tìm kiếm".
 * - Khu vực lưu 1 lần vào hồ sơ (profiles.connect_province / connect_district).
 * - Lượt quét theo tuần (mặc định 30 lượt/tuần), cấu hình trong Admin Panel.
 */
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------- Cấu hình ------------------------------- */

export interface ConnectConfig {
  fanpage_url: string;
  facebook_url: string;
  weekly_scan_limit: number;
  reset_weekday: number; // 0 = CN, 1 = T2 ...
  zalo_links: Record<string, string>;
}

export const DEFAULT_CONFIG: ConnectConfig = {
  fanpage_url: "https://www.facebook.com/",
  facebook_url: "https://www.facebook.com/",
  weekly_scan_limit: 30,
  reset_weekday: 1,
  zalo_links: {},
};

let configCache: ConnectConfig | null = null;

/** Đọc cấu hình Kết nối (cache trong phiên → không query lại). */
export async function fetchConnectConfig(): Promise<ConnectConfig> {
  if (configCache) return configCache;
  try {
    const { data } = await supabase
      .from("connect_settings")
      .select("id, enabled, packet_count, fall_speed, fall_speed_jitter, spawn_gap_ms, duration_sec, cooldown_hours, reward_min, reward_max, reward_table, scan_costs, fanpage_url, facebook_url, updated_at, weekly_scan_limit, reset_weekday, zalo_links")
      .eq("id", 1)
      .maybeSingle();
    const row = (data ?? {}) as Partial<ConnectConfig>;
    configCache = {
      fanpage_url: row.fanpage_url || DEFAULT_CONFIG.fanpage_url,
      facebook_url: row.facebook_url || DEFAULT_CONFIG.facebook_url,
      weekly_scan_limit: Number(row.weekly_scan_limit) > 0 ? Number(row.weekly_scan_limit) : 30,
      reset_weekday: Number.isFinite(Number(row.reset_weekday)) ? Number(row.reset_weekday) : 1,
      zalo_links: (row.zalo_links as Record<string, string>) || {},
    };
  } catch {
    configCache = DEFAULT_CONFIG;
  }
  return configCache;
}

/** Link nhóm Zalo VIP theo khu vực (khớp tên tỉnh, không phân biệt hoa thường). */
export function zaloLinkFor(cfg: ConnectConfig, province: string | null | undefined): string | null {
  if (!province) return null;
  const key = province.trim().toLowerCase();
  const found = Object.entries(cfg.zalo_links).find(([k]) => k.trim().toLowerCase() === key);
  return found?.[1] || null;
}

/**
 * Các khoá dành riêng trong `zalo_links` — Admin Panel quản lý, không đụng DB schema.
 * __vip_group   : link nhóm VIP mặc định (khi khu vực chưa có nhóm riêng)
 * __messenger   : link Messenger Admin
 * __zalo_admin  : link Zalo Admin
 */
export const VIP_LINK_KEYS = {
  vipGroup: "__vip_group",
  messenger: "__messenger",
  zaloAdmin: "__zalo_admin",
} as const;

/** Khu vực là khoá thường (không phải khoá dành riêng). */
export function isAreaKey(key: string): boolean {
  return !key.startsWith("__");
}

/** Link nhóm VIP để hiển thị trong popup: ưu tiên nhóm theo khu vực, sau đó nhóm mặc định. */
export function vipGroupLink(cfg: ConnectConfig, province: string | null | undefined): string {
  return zaloLinkFor(cfg, province) || cfg.zalo_links[VIP_LINK_KEYS.vipGroup] || "";
}

/** Link nhắn tin Admin: Messenger → Zalo Admin → Facebook Admin. */
export function adminContactLink(cfg: ConnectConfig): string {
  return (
    cfg.zalo_links[VIP_LINK_KEYS.messenger] ||
    cfg.zalo_links[VIP_LINK_KEYS.zaloAdmin] ||
    cfg.facebook_url ||
    ""
  );
}

/** Xoá cache cấu hình (dùng sau khi Admin lưu thay đổi). */
export function clearConnectConfigCache(): void {
  configCache = null;
}


/* ------------------------- Cổng xác nhận 3 bước ------------------------- */

const GATE_KEY = "cx_gate_v1";
const GATE_TTL_MS = 24 * 60 * 60 * 1000;

export interface GateState {
  age: boolean;
  fanpage: boolean;
  facebook: boolean;
  at: number;
}

const EMPTY_GATE: GateState = { age: false, fanpage: false, facebook: false, at: 0 };

export function readGate(): GateState {
  if (typeof window === "undefined") return EMPTY_GATE;
  try {
    const raw = window.localStorage.getItem(GATE_KEY);
    if (!raw) return EMPTY_GATE;
    const g = JSON.parse(raw) as GateState;
    if (!g || Date.now() - (g.at || 0) > GATE_TTL_MS) return EMPTY_GATE;
    return { age: !!g.age, fanpage: !!g.fanpage, facebook: !!g.facebook, at: g.at || 0 };
  } catch {
    return EMPTY_GATE;
  }
}

export function writeGate(g: GateState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GATE_KEY, JSON.stringify(g));
  } catch {
    /* bỏ qua */
  }
}

export function isGateDone(g: GateState): boolean {
  return g.age && g.fanpage && g.facebook;
}

/* ----------------------------- Khu vực ----------------------------- */

const AREA_KEY = "cx_area_v1";

export interface Area {
  province: string;
  district: string;
}

function readAreaLocal(): Area | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AREA_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Area;
    return a?.province ? { province: a.province, district: a.district || "" } : null;
  } catch {
    return null;
  }
}

function writeAreaLocal(a: Area): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AREA_KEY, JSON.stringify(a));
  } catch {
    /* bỏ qua */
  }
}

/** Khu vực đã đăng ký trong hồ sơ (chỉ hỏi 1 lần). */
export async function fetchProfileArea(): Promise<Area | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return readAreaLocal();
    const { data } = await supabase
      .from("profiles")
      .select("connect_province, connect_district")
      .eq("id", uid)
      .maybeSingle();
    const row = data as { connect_province?: string | null; connect_district?: string | null } | null;
    if (row?.connect_province) {
      const area = { province: row.connect_province, district: row.connect_district || "" };
      writeAreaLocal(area);
      return area;
    }
    return readAreaLocal();
  } catch {
    return readAreaLocal();
  }
}

/** Lưu khu vực vào hồ sơ (một lần duy nhất). */
export async function saveProfileArea(area: Area): Promise<void> {
  writeAreaLocal(area);
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    await supabase
      .from("profiles")
      .update({ connect_province: area.province, connect_district: area.district || null })
      .eq("id", uid);
  } catch {
    /* cột chưa tồn tại → vẫn dùng bản lưu cục bộ */
  }
}

/* --------------------------- Lượt quét / tuần --------------------------- */

export interface ScanQuota {
  used: number;
  limit: number;
  weekStart: string;
}

/** Ngày bắt đầu tuần (YYYY-MM-DD) theo mốc reset của Admin. */
export function weekStartISO(resetWeekday: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() - resetWeekday + 7) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const QUOTA_KEY = "cx_scan_quota_v1";

function readQuotaLocal(weekStart: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUOTA_KEY) || "{}") as { w?: string; u?: number };
    return raw.w === weekStart ? Number(raw.u) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeQuotaLocal(weekStart: string, used: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUOTA_KEY, JSON.stringify({ w: weekStart, u: used }));
  } catch {
    /* bỏ qua */
  }
}

export async function fetchScanQuota(cfg: ConnectConfig): Promise<ScanQuota> {
  const weekStart = weekStartISO(cfg.reset_weekday);
  let used = readQuotaLocal(weekStart);
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (uid) {
      const { data } = await supabase
        .from("connect_scan_usage")
        .select("used")
        .eq("user_id", uid)
        .eq("week_start", weekStart)
        .maybeSingle();
      const remote = Number((data as { used?: number } | null)?.used ?? 0);
      used = Math.max(used, remote);
    }
  } catch {
    /* bảng chưa tồn tại → dùng bản cục bộ */
  }
  writeQuotaLocal(weekStart, used);
  return { used: Math.min(used, cfg.weekly_scan_limit), limit: cfg.weekly_scan_limit, weekStart };
}

/** Ghi nhận 1 lượt quét. Trả về số lượt đã dùng sau khi cộng. */
export async function consumeScan(quota: ScanQuota): Promise<number> {
  const used = quota.used + 1;
  writeQuotaLocal(quota.weekStart, used);
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (uid) {
      await supabase
        .from("connect_scan_usage")
        .upsert(
          { user_id: uid, week_start: quota.weekStart, used, updated_at: new Date().toISOString() },
          { onConflict: "user_id,week_start" },
        );
    }
  } catch {
    /* bỏ qua */
  }
  return used;
}

/* ------------------------------ Tìm kiếm ------------------------------ */

export interface RadarMatch {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  age: number | null;
  province: string | null;
  district: string | null;
  distance_km: number;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  display_name?: string | null;
  username: string | null;
  avatar: string | null;
  avatar_url: string | null;
  age: number | null;
  province: string | null;
  is_clone?: boolean | null;
  is_virtual?: boolean | null;
}

const SELECT_COLS =
  "id, full_name, display_name, username, avatar, avatar_url, age, province, is_clone, is_virtual";

/** Hash ổn định → khoảng cách mô phỏng không "nhảy" mỗi lần render. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Khoảng cách hợp lý: cùng khu vực → gần, khác tỉnh → xa hơn. */
export function simulateDistance(targetId: string, area: Area, targetProvince: string | null): number {
  const sameProvince =
    !!targetProvince && !!area.province && targetProvince.includes(area.province.replace("TP.", "").trim());
  const seed = hash(targetId + area.province + area.district);
  if (sameProvince) return 1 + (seed % 14); // 1 – 14 km
  return 18 + (seed % 45); // 18 – 62 km
}

export const SCAN_DURATIONS = [3, 5, 10, 15] as const;

export function pickScanDuration(): number {
  return SCAN_DURATIONS[Math.floor(Math.random() * SCAN_DURATIONS.length)]!;
}

function toMatch(row: ProfileRow, area: Area): RadarMatch {
  return {
    id: row.id,
    full_name: row.display_name || row.full_name,
    username: row.username,
    avatar: row.avatar || row.avatar_url,
    age: row.age,
    province: row.province,
    district: null,
    distance_km: simulateDistance(row.id, area, row.province),
  };
}

/**
 * Tìm 1 hồ sơ phù hợp: ưu tiên tài khoản Clone nữ do Admin tạo, cùng khu vực.
 * Chỉ 1 request duy nhất cho mỗi lần quét.
 */
export async function findMatch(area: Area, excludeId?: string | null): Promise<RadarMatch | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(SELECT_COLS)
    .eq("gender", "female")
    .eq("status", "active")
    .eq("is_banned", false)
    .limit(120);

  if (error) throw error;
  let rows = ((data ?? []) as ProfileRow[]).filter((r) => r.id !== excludeId);
  if (!rows.length) return null;

  const clones = rows.filter((r) => r.is_clone || r.is_virtual);
  if (clones.length) rows = clones;

  const near = rows.filter(
    (r) => r.province && area.province && r.province.includes(area.province.replace("TP.", "").trim()),
  );
  const pool = near.length ? near : rows;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  return toMatch(pick, area);
}

/* ------------------------------ Vị trí GPS ------------------------------ */

const GEO_KEY = "cx_geo_asked_v1";

export function hasAskedGeo(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(GEO_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAskedGeo(): void {
  try {
    window.localStorage.setItem(GEO_KEY, "1");
  } catch {
    /* bỏ qua */
  }
}
