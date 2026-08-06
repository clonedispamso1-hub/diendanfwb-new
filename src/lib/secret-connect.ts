/**
 * ❤️ Kết Nối Bí Mật — data layer.
 *
 * Tất cả truy vấn đều "mềm": nếu bảng chưa được tạo (chưa chạy migration
 * supabase/sql/RUN_NOW_secret_connect.sql) thì fallback về mặc định /
 * localStorage để UI vẫn chạy, không crash.
 */
import { supabase } from "@/lib/supabase";
import { getDistricts } from "@/lib/vn-locations";

const sb = supabase as unknown as any;

/* ---------------------------------- types --------------------------------- */

export interface SecretConnectSettings {
  enabled: boolean;
  search_min_sec: number;
  search_max_sec: number;
  wait_min_sec: number;
  wait_max_sec: number;
  accept_rate: number;
  weekly_clone_count: number;
  free_weekly_limit: number;
  vip_unlimited: boolean;
  hearts_enabled: boolean;
  allow_profile_view: boolean;
  allow_message: boolean;
  /** Hiện "📍 Khu vực đã xác minh" (ẩn danh) trước khi ghép. */
  show_area_before: boolean;
  /** Hiện khu vực thật sau khi ghép thành công. */
  show_real_area_after: boolean;
  /** Hiển thị Quận/Huyện + Tỉnh/Thành (thay vì chỉ Tỉnh/Thành). */
  show_district: boolean;
  /** Bật hiệu ứng lật thông tin. */
  flip_enabled: boolean;
  /** Thời gian mỗi bước lật thông tin (ms). */
  flip_ms: number;
  /** Số lần ghép thất bại tối thiểu trước khi cho 1 lần thành công. */
  success_after_min: number;
  /** Số lần ghép thất bại tối đa trước khi cho 1 lần thành công. */
  success_after_max: number;
}

export const DEFAULT_SETTINGS: SecretConnectSettings = {
  enabled: true,
  search_min_sec: 5,
  search_max_sec: 10,
  wait_min_sec: 15,
  wait_max_sec: 20,
  accept_rate: 0.2,
  weekly_clone_count: 30,
  free_weekly_limit: 30,
  vip_unlimited: true,
  hearts_enabled: true,
  allow_profile_view: true,
  allow_message: true,
  show_area_before: true,
  show_real_area_after: true,
  show_district: true,
  flip_enabled: true,
  flip_ms: 2000,
  success_after_min: 2,
  success_after_max: 6,
};

export type ConnectIntent = "FWB" | "ONS" | "Người yêu";

export interface ConnectCandidate {
  cloneId: string;
  name: string;
  avatar: string | null;
  province: string;
  district: string;
  gender: "female" | "male" | "other";
  age: number;
  distanceKm: number;
  intent: ConnectIntent;
}

export type FailReason = "busy" | "left" | "declined" | "no_reply";

export const FAIL_MESSAGES: Record<FailReason, string> = {
  busy: "😔 Đối phương đang bận.",
  left: "😢 Đối phương đã rời khỏi hàng chờ.",
  declined: "🙁 Đối phương từ chối lời kết nối.",
  no_reply: "⌛ Đối phương không phản hồi.",
};

export const DISTANCES = [2, 5, 8, 15, 22];

/* --------------------------------- helpers -------------------------------- */

export function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));
}
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function currentWeekKey(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalize(s?: string | null) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(tp\.?|thanh pho|tinh)\s*/, "")
    .trim();
}

/* -------------------------------- settings -------------------------------- */

export async function loadSecretConnectSettings(): Promise<SecretConnectSettings> {
  try {
    const { data } = await sb
      .from("secret_connect_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...data, accept_rate: Number(data.accept_rate ?? 0.2) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSecretConnectSettings(
  patch: Partial<SecretConnectSettings>,
): Promise<boolean> {
  try {
    const { error } = await sb
      .from("secret_connect_settings")
      .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}

/* ------------------------------- connect area ------------------------------ */

const AREA_KEY = "secret_connect_area_v1";

export function getLocalConnectArea(uid?: string | null): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${AREA_KEY}_${uid || "anon"}`);
}

export async function loadConnectArea(uid: string): Promise<string | null> {
  return syncConnectArea(uid);
}

/**
 * Khu vực kết nối LUÔN lấy từ hồ sơ (profiles.region → province → location).
 * Người dùng không chọn, không có dropdown. Nếu hồ sơ đổi khu vực thì
 * connect_area tự cập nhật theo.
 */
export async function syncConnectArea(uid: string): Promise<string | null> {
  const local = getLocalConnectArea(uid);
  let area: string | null = null;
  try {
    const { data } = await sb
      .from("profiles")
      .select("region, province, location, connect_area")
      .eq("id", uid)
      .maybeSingle();
    area =
      (data?.region as string) ||
      (data?.province as string) ||
      (data?.location as string) ||
      (data?.connect_area as string) ||
      null;
    if (area && data?.connect_area !== area) void saveConnectArea(uid, area);
  } catch {
    /* cột chưa có — dùng local */
  }
  if (area) {
    try {
      window.localStorage.setItem(`${AREA_KEY}_${uid || "anon"}`, area);
    } catch {
      /* noop */
    }
    return area;
  }
  return local;
}

export async function saveConnectArea(uid: string, area: string): Promise<void> {
  try {
    window.localStorage.setItem(`${AREA_KEY}_${uid || "anon"}`, area);
  } catch {
    /* noop */
  }
  try {
    await sb.from("profiles").update({ connect_area: area }).eq("id", uid);
  } catch {
    /* noop */
  }
}

/* --------------------------------- quota ---------------------------------- */

const USAGE_KEY = "secret_connect_usage_v1";

function localUsageKey(uid: string) {
  return `${USAGE_KEY}_${uid}_${currentWeekKey()}`;
}

export function getLocalUsage(uid: string): number {
  if (typeof window === "undefined") return 0;
  return parseInt(window.localStorage.getItem(localUsageKey(uid)) || "0", 10) || 0;
}

export async function loadWeeklyUsage(uid: string): Promise<number> {
  try {
    const { data } = await sb
      .from("secret_connect_usage")
      .select("used_count")
      .eq("user_id", uid)
      .eq("week_start", currentWeekKey())
      .maybeSingle();
    if (data) return data.used_count ?? 0;
  } catch {
    /* noop */
  }
  return getLocalUsage(uid);
}

export async function bumpWeeklyUsage(uid: string): Promise<number> {
  const next = getLocalUsage(uid) + 1;
  try {
    window.localStorage.setItem(localUsageKey(uid), String(next));
  } catch {
    /* noop */
  }
  try {
    const { data } = await sb.rpc("secret_connect_bump_usage");
    const remote = Array.isArray(data) ? data[0]?.used_count : (data as any)?.used_count;
    if (typeof remote === "number") return remote;
  } catch {
    /* noop */
  }
  return next;
}

/* --------------------------------- clones --------------------------------- */

export interface CloneRow {
  id: string;
  clone_id: string;
  enabled: boolean;
  used: boolean;
  matched: boolean;
  shuffle_order: number;
  /** Snapshot lấy từ "Tài khoản thứ hai" khi admin tick chọn. */
  name?: string | null;
  avatar?: string | null;
  region?: string | null;
  age?: number | null;
  gender?: string | null;
  intent?: string | null;
}

export interface CloneProfile {
  id: string;
  display_name: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar: string | null;
  province: string | null;
  age: number | null;
  gender: string | null;
  bio: string | null;
  tag: string | null;
}

/**
 * Nguồn clone DUY NHẤT = "Tài khoản thứ hai" trong Admin Panel.
 * Không tạo/không lưu clone riêng cho Kết Nối Bí Mật.
 * (Chỉ admin gọi được RPC này; trang người dùng dùng loadPoolProfiles.)
 */
export async function loadAllClones(limit = 1000): Promise<CloneProfile[]> {
  try {
    const { data, error } = await sb.rpc("admin_list_internal_accounts", {
      p_search: null,
      p_limit: limit,
      p_offset: 0,
      p_gender: null,
    });
    if (!error && Array.isArray(data)) {
      return (data as any[]).map((r) => ({
        id: r.id,
        display_name: r.full_name ?? null,
        full_name: r.full_name ?? null,
        username: r.username ?? null,
        avatar_url: r.avatar ?? null,
        avatar: r.avatar ?? null,
        province: r.province ?? r.region ?? null,
        age: r.age ?? null,
        gender: r.gender ?? null,
        bio: r.bio ?? null,
        tag: r.intent ?? null,
      })) as CloneProfile[];
    }
  } catch {
    /* noop */
  }
  try {
    const { data } = await sb
      .from("fake_profiles")
      .select("id, display_name, full_name, username, avatar_url, avatar, province, age, gender, bio, tag")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []) as CloneProfile[];
  } catch {
    return [];
  }
}

/**
 * Pool clone DUY NHẤT của Kết Nối Bí Mật = snapshot lưu trong
 * `secret_connect_clones` (do admin tick chọn ở "Tài khoản thứ hai").
 * KHÔNG đọc `profiles`, KHÔNG đọc member thật, KHÔNG đọc user ngoài pool.
 */
export function cloneRowToProfile(r: CloneRow): CloneProfile {
  return {
    id: r.clone_id,
    display_name: r.name ?? null,
    full_name: r.name ?? null,
    username: null,
    avatar_url: r.avatar ?? null,
    avatar: r.avatar ?? null,
    province: r.region ?? null,
    age: r.age ?? null,
    gender: r.gender ?? null,
    bio: null,
    tag: r.intent ?? null,
  };
}

export async function loadCloneStates(): Promise<CloneRow[]> {
  try {
    const { data } = await sb.from("secret_connect_clones").select("*");
    return (data || []) as CloneRow[];
  } catch {
    return [];
  }
}

export async function setCloneEnabled(
  cloneId: string,
  enabled: boolean,
  snapshot?: CloneProfile,
): Promise<boolean> {
  const base: Record<string, unknown> = {
    clone_id: cloneId,
    enabled,
    updated_at: new Date().toISOString(),
  };
  const full = snapshot
    ? {
        ...base,
        name: snapshot.display_name || snapshot.full_name || snapshot.username || null,
        avatar: snapshot.avatar_url || snapshot.avatar || null,
        region: snapshot.province || null,
        age: snapshot.age ?? null,
        gender: snapshot.gender || null,
        intent: snapshot.tag || null,
        shuffle_order: Math.floor(Math.random() * 100000),
      }
    : base;
  try {
    const { error } = await sb
      .from("secret_connect_clones")
      .upsert(full, { onConflict: "clone_id" });
    if (!error) return true;
  } catch {
    /* cột snapshot chưa có — thử lại tối giản */
  }
  try {
    const { error } = await sb
      .from("secret_connect_clones")
      .upsert(base, { onConflict: "clone_id" });
    return !error;
  } catch {
    return false;
  }
}

export async function shuffleClones(): Promise<boolean> {
  try {
    const rows = await loadCloneStates();
    await Promise.all(
      rows.map((r) =>
        sb
          .from("secret_connect_clones")
          .update({ shuffle_order: Math.floor(Math.random() * 100000) })
          .eq("clone_id", r.clone_id),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export async function weeklyReset(): Promise<boolean> {
  try {
    const { error } = await sb.rpc("secret_connect_weekly_reset");
    if (!error) return true;
  } catch {
    /* noop */
  }
  try {
    const { error } = await sb
      .from("secret_connect_clones")
      .update({ used: false, matched: false, shuffle_order: Math.floor(Math.random() * 100000) })
      .neq("clone_id", "00000000-0000-0000-0000-000000000000");
    return !error;
  } catch {
    return false;
  }
}

/** Reset tự động vào thứ Hai 00:00 (chạy 1 lần / tuần / trình duyệt). */
const RESET_KEY = "secret_connect_last_reset_week";
export async function ensureWeeklyReset(): Promise<void> {
  if (typeof window === "undefined") return;
  const week = currentWeekKey();
  if (window.localStorage.getItem(RESET_KEY) === week) return;
  window.localStorage.setItem(RESET_KEY, week);
  await weeklyReset();
}

export async function markCloneUsed(cloneId: string, matched: boolean): Promise<void> {
  try {
    await sb
      .from("secret_connect_clones")
      .upsert(
        { clone_id: cloneId, used: true, matched, updated_at: new Date().toISOString() },
        { onConflict: "clone_id" },
      );
  } catch {
    /* noop */
  }
}

export async function logConnectAttempt(opts: {
  userId: string;
  cloneId: string;
  area: string;
  result: string;
}): Promise<void> {
  try {
    await sb.from("secret_connect_logs").insert({
      user_id: opts.userId,
      clone_id: opts.cloneId,
      area: opts.area,
      result: opts.result,
    });
  } catch {
    /* noop */
  }
}

export interface ConnectLogRow {
  id: string;
  user_id: string | null;
  clone_id: string | null;
  area: string | null;
  result: string;
  created_at: string;
}

export async function loadConnectLogs(limit = 100): Promise<ConnectLogRow[]> {
  try {
    const { data } = await sb
      .from("secret_connect_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []) as ConnectLogRow[];
  } catch {
    return [];
  }
}

/* ------------------------------ candidate pool ----------------------------- */

const INTENTS: ConnectIntent[] = ["FWB", "ONS", "Người yêu"];

function intentFromTag(tag?: string | null): ConnectIntent {
  const t = normalize(tag);
  if (t.includes("ons")) return "ONS";
  if (t.includes("fwb")) return "FWB";
  if (t.includes("yeu") || t.includes("dating") || t.includes("love")) return "Người yêu";
  return pick(INTENTS);
}

function toCandidate(p: CloneProfile, area: string): ConnectCandidate {
  const districts = getDistricts(area);
  const g = normalize(p.gender);
  return {
    cloneId: p.id,
    name: p.display_name || p.full_name || p.username || "Ẩn danh",
    avatar: p.avatar_url || p.avatar || null,
    province: area,
    district: pick(districts),
    gender: g === "male" || g === "nam" ? "male" : g === "female" || g === "nu" ? "female" : "other",
    // Tuổi luôn random 18–60 mỗi lần tìm (không lấy tuổi cố định của clone).
    age: randInt(18, 60),
    distanceKm: pick(DISTANCES),
    intent: intentFromTag(p.tag),
  };
}

/* ------------------------ per-user clone usage (tuần) ---------------------- */

export interface UserCloneUse {
  clone_id: string;
  matched: boolean;
}

const USES_KEY = "secret_connect_uses_v2";

function localUsesKey(uid: string) {
  return `${USES_KEY}_${uid}_${currentWeekKey()}`;
}

function readLocalUses(uid: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(localUsesKey(uid)) || "{}") || {};
  } catch {
    return {};
  }
}

/** Clone đã hiện / đã ghép với CHÍNH người dùng này trong tuần hiện tại. */
export async function loadUserCloneUses(uid: string): Promise<UserCloneUse[]> {
  const local = Object.entries(readLocalUses(uid)).map(([clone_id, matched]) => ({
    clone_id,
    matched: !!matched,
  }));
  try {
    const { data } = await sb
      .from("secret_connect_clone_uses")
      .select("clone_id, matched")
      .eq("user_id", uid)
      .eq("week_start", currentWeekKey());
    if (Array.isArray(data) && data.length > 0) {
      const merged = new Map(local.map((r) => [r.clone_id, r.matched]));
      for (const r of data as any[]) merged.set(r.clone_id, !!r.matched || !!merged.get(r.clone_id));
      return [...merged].map(([clone_id, matched]) => ({ clone_id, matched }));
    }
  } catch {
    /* bảng chưa có — dùng local */
  }
  return local;
}

/** Đánh dấu clone đã dùng (và đã ghép) với riêng người dùng này trong tuần. */
export async function markCloneUsedForUser(
  uid: string,
  cloneId: string,
  matched: boolean,
): Promise<void> {
  try {
    const map = readLocalUses(uid);
    map[cloneId] = !!map[cloneId] || matched;
    window.localStorage.setItem(localUsesKey(uid), JSON.stringify(map));
  } catch {
    /* noop */
  }
  try {
    await sb.from("secret_connect_clone_uses").upsert(
      {
        user_id: uid,
        clone_id: cloneId,
        week_start: currentWeekKey(),
        matched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,clone_id,week_start" },
    );
  } catch {
    /* noop */
  }
  // Thống kê tổng cho Admin Panel.
  void markCloneUsed(cloneId, matched);
}

/* --------------------- cơ chế "1 thành công sau N lần" -------------------- */

const GATE_KEY = "secret_connect_gate_v1";

function gateKey(uid: string) {
  return `${GATE_KEY}_${uid}`;
}

/** Số lần thất bại cần trước khi được 1 lần thành công (random trong khoảng admin cấu hình). */
export function getMatchGate(uid: string, s: SecretConnectSettings): { fails: number; need: number } {
  const fallback = { fails: 0, need: randInt(s.success_after_min, s.success_after_max) };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(gateKey(uid));
    if (!raw) {
      window.localStorage.setItem(gateKey(uid), JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fails !== "number" || typeof parsed?.need !== "number") return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeGate(uid: string, gate: { fails: number; need: number }) {
  try {
    window.localStorage.setItem(gateKey(uid), JSON.stringify(gate));
  } catch {
    /* noop */
  }
}

/**
 * Quyết định lượt ghép này thành công hay không.
 * Thất bại đủ `need` lần thì lượt tiếp theo chắc chắn thành công, rồi reset.
 */
export function resolveMatchOutcome(uid: string, s: SecretConnectSettings): boolean {
  const gate = getMatchGate(uid, s);
  if (gate.fails >= gate.need) {
    writeGate(uid, { fails: 0, need: randInt(s.success_after_min, s.success_after_max) });
    return true;
  }
  writeGate(uid, { fails: gate.fails + 1, need: gate.need });
  return false;
}

/* ------------------------------- pool loader ------------------------------ */

function fallbackCandidate(area: string): ConnectCandidate {
  const districts = getDistricts(area);
  return {
    cloneId: "",
    name: "Ẩn danh",
    avatar: null,
    province: area,
    district: districts.length ? pick(districts) : area,
    gender: pick(["female", "male"] as ConnectCandidate["gender"][]),
    age: randInt(18, 60),
    distanceKm: pick(DISTANCES),
    intent: pick(INTENTS),
  };
}

/**
 * Lấy pool clone khả dụng cho khu vực của người dùng.
 * Nguồn DUY NHẤT: snapshot trong `secret_connect_clones` (admin tick chọn ở
 * "Tài khoản thứ hai"). Không đọc profiles / member thật.
 * Loại clone đã hiện / đã ghép với chính người dùng này trong tuần.
 * Pool KHÔNG BAO GIỜ rỗng — luôn có ít nhất một đối tượng để hiển thị.
 */
export async function loadCandidatePool(
  area: string,
  max = 30,
  uid?: string | null,
): Promise<ConnectCandidate[]> {
  const [states, uses] = await Promise.all([
    loadCloneStates(),
    uid ? loadUserCloneUses(uid) : Promise.resolve([] as UserCloneUse[]),
  ]);
  const usedByMe = new Set(uses.map((u) => u.clone_id));
  const matchedByMe = new Set(uses.filter((u) => u.matched).map((u) => u.clone_id));

  const enabled = states.filter((s) => s.enabled);
  const profiles = enabled.map(cloneRowToProfile);
  const stateMap = new Map(enabled.map((s) => [s.clone_id, s]));
  const areaKey = normalize(area);
  const inArea = profiles.filter((p) => {
    const pk = normalize(p.province);
    return !pk || pk === areaKey;
  });
  const base = inArea.length > 0 ? inArea : profiles;

  const order = (p: CloneProfile) => stateMap.get(p.id)?.shuffle_order ?? Math.random() * 100000;
  const shuffled = base
    .map((p) => ({ p, o: order(p) + Math.random() }))
    .sort((a, b) => a.o - b.o)
    .map((x) => x.p);

  const stateOf = (id: string) => stateMap.get(id);
  let usable = shuffled.filter(
    (p) => !usedByMe.has(p.id) && !stateOf(p.id)?.used && !stateOf(p.id)?.matched,
  );
  if (usable.length === 0) usable = shuffled.filter((p) => !usedByMe.has(p.id));
  if (usable.length === 0) usable = shuffled.filter((p) => !matchedByMe.has(p.id));
  if (usable.length === 0) usable = shuffled;

  const pool = usable.slice(0, Math.max(1, max)).map((p) => toCandidate(p, area));
  // Tuyệt đối không bao giờ rỗng — luôn có ít nhất một đối tượng ẩn danh.
  while (pool.length === 0) pool.push(fallbackCandidate(area));
  return pool;
}

/* ======================================================================== *
 *  V2 — KHO CLONE RIÊNG (secret_connect_accounts)
 *  Clone chỉ được tạo từ Admin → Kết Nối Bí Mật. Tài khoản tạo ra vẫn là
 *  tài khoản thật nên đồng thời xuất hiện ở "Tài khoản thứ hai".
 *  Ngược lại: tài khoản có sẵn ở "Tài khoản thứ hai" KHÔNG tự thành clone.
 * ======================================================================== */

export interface SecretAccountRow {
  id: string;
  account_id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
  region: string | null;
  age: number | null;
  gender: string | null;
  intent: string | null;
  batch_week: string;
  in_pool: boolean;
  used: boolean;
  matched: boolean;
  shuffle_order: number;
  created_at: string;
}

/** Danh sách kho clone riêng (mặc định mới nhất trước). */
export async function loadSecretAccounts(limit = 500): Promise<SecretAccountRow[]> {
  try {
    const { data } = await sb
      .from("secret_connect_accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []) as SecretAccountRow[];
  } catch {
    return [];
  }
}

/** Đăng ký các tài khoản vừa tạo vào kho clone của Kết Nối Bí Mật. */
export async function registerSecretAccountsByUsername(
  usernames: string[],
): Promise<number> {
  const names = usernames.map((u) => u.trim()).filter(Boolean);
  if (!names.length) return 0;
  let profiles: any[] = [];
  try {
    const { data } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar, avatar_url, province, region, age, gender")
      .in("username", names);
    profiles = data || [];
  } catch {
    return 0;
  }
  if (!profiles.length) return 0;
  const rows = profiles.map((p) => ({
    account_id: p.id,
    username: p.username ?? null,
    name: p.full_name ?? p.username ?? null,
    avatar: p.avatar ?? p.avatar_url ?? null,
    region: p.province ?? p.region ?? null,
    age: p.age ?? null,
    gender: p.gender ?? null,
    intent: pick(INTENTS),
    in_pool: true,
    shuffle_order: Math.floor(Math.random() * 100000),
    updated_at: new Date().toISOString(),
  }));
  try {
    const { error } = await sb
      .from("secret_connect_accounts")
      .upsert(rows, { onConflict: "account_id" });
    if (error) return 0;
    return rows.length;
  } catch {
    return 0;
  }
}

/** Bật/tắt một clone khỏi danh sách ghép đôi tuần này. */
export async function setSecretAccountInPool(
  accountId: string,
  inPool: boolean,
): Promise<boolean> {
  try {
    const { error } = await sb
      .from("secret_connect_accounts")
      .update({ in_pool: inPool, updated_at: new Date().toISOString() })
      .eq("account_id", accountId);
    return !error;
  } catch {
    return false;
  }
}

/** Làm mới tuần: gỡ toàn bộ clone khỏi ghép đôi, KHÔNG xoá tài khoản. */
export async function releaseWeekPool(): Promise<number> {
  try {
    const { data, error } = await sb.rpc("secret_connect_release_week");
    if (!error && typeof data === "number") return data;
  } catch {
    /* noop */
  }
  try {
    const { data } = await sb
      .from("secret_connect_accounts")
      .update({ in_pool: false, updated_at: new Date().toISOString() })
      .eq("in_pool", true)
      .select("id");
    return (data || []).length;
  } catch {
    return 0;
  }
}

export async function shuffleSecretPool(): Promise<boolean> {
  try {
    const { error } = await sb.rpc("secret_connect_shuffle_pool");
    if (!error) return true;
  } catch {
    /* noop */
  }
  try {
    const rows = await loadSecretAccounts();
    await Promise.all(
      rows
        .filter((r) => r.in_pool)
        .map((r) =>
          sb
            .from("secret_connect_accounts")
            .update({ shuffle_order: Math.floor(Math.random() * 100000) })
            .eq("account_id", r.account_id),
        ),
    );
    return true;
  } catch {
    return false;
  }
}

export async function markSecretAccountUsed(accountId: string, matched: boolean): Promise<void> {
  try {
    await sb
      .from("secret_connect_accounts")
      .update({ used: true, matched, updated_at: new Date().toISOString() })
      .eq("account_id", accountId);
  } catch {
    /* noop */
  }
}

function secretRowToProfile(r: SecretAccountRow): CloneProfile {
  return {
    id: r.account_id,
    display_name: r.name,
    full_name: r.name,
    username: r.username,
    avatar_url: r.avatar,
    avatar: r.avatar,
    province: r.region,
    age: r.age,
    gender: r.gender,
    bio: null,
    tag: r.intent,
  };
}

/**
 * Pool V2 — chỉ đọc từ KHO CLONE RIÊNG (`secret_connect_accounts`, in_pool).
 * Nếu kho trống (chưa chạy migration / chưa tạo clone) mới fallback về pool cũ
 * để không làm hỏng trải nghiệm hiện có.
 */
export async function loadSecretCandidatePool(
  area: string,
  max = 30,
  uid?: string | null,
): Promise<ConnectCandidate[]> {
  const [rows, uses] = await Promise.all([
    loadSecretAccounts(),
    uid ? loadUserCloneUses(uid) : Promise.resolve([] as UserCloneUse[]),
  ]);
  const pool = rows.filter((r) => r.in_pool);
  if (pool.length === 0) return loadCandidatePool(area, max, uid);

  const usedByMe = new Set(uses.map((u) => u.clone_id));
  const matchedByMe = new Set(uses.filter((u) => u.matched).map((u) => u.clone_id));
  const areaKey = normalize(area);

  const inArea = pool.filter((r) => {
    const pk = normalize(r.region);
    return !pk || pk === areaKey;
  });
  const base = inArea.length > 0 ? inArea : pool;

  const shuffled = [...base].sort(
    (a, b) => a.shuffle_order + Math.random() - (b.shuffle_order + Math.random()),
  );

  let usable = shuffled.filter((r) => !usedByMe.has(r.account_id) && !r.used && !r.matched);
  if (usable.length === 0) usable = shuffled.filter((r) => !usedByMe.has(r.account_id));
  if (usable.length === 0) usable = shuffled.filter((r) => !matchedByMe.has(r.account_id));
  if (usable.length === 0) usable = shuffled;

  const out = usable
    .slice(0, Math.max(1, max))
    .map((r) => toCandidate(secretRowToProfile(r), area));
  while (out.length === 0) out.push(fallbackCandidate(area));
  return out;
}
