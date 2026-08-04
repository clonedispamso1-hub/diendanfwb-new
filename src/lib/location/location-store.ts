/**
 * PHASE 3 — Tìm quanh đây.
 * Quản lý vị trí của user hiện tại:
 *   - Xin quyền trình duyệt.
 *   - Upsert vào bảng public.user_locations (admin-only mới đọc được toạ độ gốc).
 *   - Lưu cờ "đã hỏi quyền" trong localStorage để không spam popup.
 *
 * Thiết kế tách riêng (Phase 4 có thể thêm bán kính 1km/5km/10km/50km
 * mà không phải viết lại module này).
 */

import { supabase } from "@/lib/supabase";
import { detectCity, type CityKey } from "./city-detector";

const ASK_FLAG_KEY = "oklove_loc_asked_v1";
const LAST_PROMPT_KEY = "oklove_loc_last_prompt_v1";
const RE_PROMPT_COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24h

export interface LocationRecord {
  user_id: string;
  latitude: number;
  longitude: number;
  city: string | null;
  accuracy_m: number | null;
  updated_at: string;
}

export type LocationPermissionStatus =
  | "unknown"   // chưa kiểm tra
  | "granted"   // user đã đồng ý + toạ độ đã có
  | "denied"    // user từ chối
  | "prompt"    // chưa hỏi lần nào
  | "unsupported";

export function isGeolocationSupported(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && "geolocation" in navigator;
}

export function hasAskedBefore(): boolean {
  try { return localStorage.getItem(ASK_FLAG_KEY) === "1"; }
  catch { return false; }
}

export function markAsked(): void {
  try {
    localStorage.setItem(ASK_FLAG_KEY, "1");
    localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

export function shouldPromptAgain(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_PROMPT_KEY) || "0");
    if (!last) return true;
    return Date.now() - last > RE_PROMPT_COOLDOWN_MS;
  } catch { return true; }
}

export async function readPermissionStatus(): Promise<LocationPermissionStatus> {
  if (!isGeolocationSupported()) return "unsupported";
  try {
    // permissions API có thể không tồn tại trên 1 số trình duyệt cũ.
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: "geolocation" as PermissionName });
      if (status.state === "granted") return "granted";
      if (status.state === "denied")  return "denied";
      return "prompt";
    }
  } catch { /* ignore */ }
  return hasAskedBefore() ? "unknown" : "prompt";
}

export function requestCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error("Trình duyệt không hỗ trợ định vị."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  });
}

export async function saveLocation(
  userId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
): Promise<{ city: CityKey | null }> {
  const city = detectCity(latitude, longitude);
  const payload = {
    user_id: userId,
    latitude,
    longitude,
    city,
    accuracy_m: accuracy,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("user_locations")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  return { city };
}

export async function fetchMyLocation(userId: string): Promise<LocationRecord | null> {
  const { data, error } = await supabase
    .from("user_locations")
    .select("user_id, latitude, longitude, city, accuracy_m, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as LocationRecord | null) ?? null;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Chưa có";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Chưa có";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60_000);
  if (min < 1)   return "Vừa xong";
  if (min < 60)  return `${min} phút trước`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr} giờ trước`;
  const day = Math.round(hr / 24);
  return `${day} ngày trước`;
}