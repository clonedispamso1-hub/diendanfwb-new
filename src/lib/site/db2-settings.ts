/**
 * Cấu hình site lưu trên Supabase #2 (DB phụ) — KHÔNG đụng DB chính.
 *
 * Bảng: public.site_settings2 (key text primary key, value jsonb, updated_at timestamptz)
 * SQL khởi tạo: docs/sql/MEDIA2_RUN_NOW_site_settings2_and_user_zalo.sql
 *
 * Không polling, chỉ đọc 1 lần khi cần và cache trong phiên.
 */
import { db2 } from "@/integrations/supabase/secondary-client";

export const REQUIRED_POPUP_KEY = "required_popup";

export interface RequiredPopupConfig {
  enabled: boolean;
  title: string;
  content: string;
  facebook_url: string;
  fanpage_url: string;
  /** Số giờ ẩn popup sau khi bấm "Tiếp tục". */
  hide_hours: number;
}

export const DEFAULT_REQUIRED_POPUP: RequiredPopupConfig = {
  enabled: false,
  title: "Thông báo",
  content:
    "Để tiếp tục sử dụng Website\n\nBạn cần:\n✔ Xác nhận đã đủ 18 tuổi\n✔ Kết bạn Facebook Admin\n✔ Theo dõi Fanpage\n\nSau khi hoàn thành hãy bấm Tiếp tục.",
  facebook_url: "",
  fanpage_url: "",
  hide_hours: 2,
};

export function normalizeRequiredPopup(raw: unknown): RequiredPopupConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: keyof RequiredPopupConfig, fb = "") =>
    typeof o[k] === "string" ? (o[k] as string) : fb;
  const hours = Number(o.hide_hours);
  return {
    enabled: o.enabled === true,
    title: str("title", DEFAULT_REQUIRED_POPUP.title) || DEFAULT_REQUIRED_POPUP.title,
    content: str("content", DEFAULT_REQUIRED_POPUP.content) || DEFAULT_REQUIRED_POPUP.content,
    facebook_url: str("facebook_url"),
    fanpage_url: str("fanpage_url"),
    hide_hours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_REQUIRED_POPUP.hide_hours,
  };
}

const cache = new Map<string, unknown>();

/** Đọc 1 khoá cấu hình từ Supabase #2 (cache trong phiên nếu `useCache`). */
export async function getSetting2<T>(key: string, useCache = true): Promise<T | null> {
  if (useCache && cache.has(key)) return cache.get(key) as T;
  try {
    const { data, error } = await db2()
      .from("site_settings2")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = ((data as any)?.value ?? null) as T | null;
    cache.set(key, value);
    return value;
  } catch {
    return (cache.get(key) as T) ?? null;
  }
}

/** Ghi 1 khoá cấu hình (Admin Panel). */
export async function setSetting2(key: string, value: unknown): Promise<void> {
  const { error } = await db2()
    .from("site_settings2")
    .upsert({ key, value, updated_at: new Date().toISOString() } as any);
  if (error) throw new Error(error.message);
  cache.set(key, value);
}

export async function fetchRequiredPopup(useCache = true): Promise<RequiredPopupConfig> {
  return normalizeRequiredPopup(await getSetting2<unknown>(REQUIRED_POPUP_KEY, useCache));
}

export async function saveRequiredPopup(cfg: RequiredPopupConfig): Promise<void> {
  await setSetting2(REQUIRED_POPUP_KEY, normalizeRequiredPopup(cfg));
}

/* ------------------------------------------------------------------ */
/* Số Zalo của thành viên — lưu HOÀN TOÀN ở Supabase #2                 */
/* Bảng: public.user_zalo (user_id uuid pk, phone text, skipped bool)   */
/* ------------------------------------------------------------------ */

export interface UserZaloRow {
  user_id: string;
  phone: string | null;
  skipped: boolean;
}

/** Số Việt Nam 10 số, bắt đầu bằng 0. */
export function isValidVnZalo(phone: string): boolean {
  return /^0\d{9}$/.test(phone.trim());
}

export async function fetchUserZalo(userId: string): Promise<UserZaloRow | null> {
  const { data, error } = await db2()
    .from("user_zalo")
    .select("user_id,phone,skipped")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserZaloRow | null) ?? null;
}

export async function saveUserZalo(
  userId: string,
  input: { phone?: string | null; skipped?: boolean },
): Promise<void> {
  const { error } = await db2().from("user_zalo").upsert({
    user_id: userId,
    phone: input.phone ?? null,
    skipped: input.skipped ?? false,
    updated_at: new Date().toISOString(),
  } as any);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Tiến trình Wizard xác minh 3 bước — lưu ở Supabase #2                */
/* Dùng chung bảng site_settings2, key = `verify_wizard:<user_id>`.     */
/* Chỉ ghi khi đổi bước / hoàn thành (không polling, không ghi liên tục)*/
/* ------------------------------------------------------------------ */

export interface VerifyProgress {
  /** Bước đang dở (1..3). */
  step: number;
  /** Thời điểm hoàn thành (ms epoch). */
  completed_at?: number;
}

const verifyKey = (userId: string) => `verify_wizard:${userId}`;

export async function loadVerifyProgress(userId: string): Promise<VerifyProgress | null> {
  if (!userId) return null;
  try {
    const raw = await getSetting2<Partial<VerifyProgress>>(verifyKey(userId), false);
    if (!raw || typeof raw !== "object") return null;
    const step = Number(raw.step);
    const completed = Number(raw.completed_at);
    return {
      step: Number.isFinite(step) ? Math.min(Math.max(step, 1), 3) : 1,
      completed_at: Number.isFinite(completed) ? completed : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveVerifyProgress(
  userId: string,
  patch: VerifyProgress,
): Promise<void> {
  if (!userId) return;
  try {
    await setSetting2(verifyKey(userId), {
      step: patch.step,
      completed_at: patch.completed_at ?? null,
    });
  } catch {
    /* best-effort: localStorage vẫn giữ trạng thái */
  }
}
