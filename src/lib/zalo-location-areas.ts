/**
 * Logic cho mục lớp 1 "VIP ZALO {LOCATION}".
 *
 * - {LOCATION} = tỉnh/thành user ĐÃ ĐĂNG KÝ trong tài khoản (không dùng GPS/IP).
 * - "Số lượng khu vực hiển thị" (area_limit) lưu trong Supabase:
 *     0  → hiển thị TẤT CẢ khu vực của tỉnh/thành đó
 *     n  → chọn NGẪU NHIÊN n khu vực (n > số khu vực thực tế → hiển thị tất cả)
 * - Không hard-code Hà Nội / TP.HCM: dữ liệu khu vực lấy từ vn-locations.
 */
import { getDistricts, resolveProvince } from "@/lib/vn-locations";

/** Mục có chứa biến {LOCATION} trong tên hay không. */
export function hasLocationToken(name: string): boolean {
  return /\{\s*LOCATION\s*\}/i.test(String(name ?? ""));
}

/** Thay {LOCATION} bằng tên tỉnh/thành của user (viết hoa). */
export function resolveLocationName(name: string, userLocation?: string | null): string {
  const raw = String(name ?? "");
  if (!hasLocationToken(raw)) return raw;
  const loc = String(userLocation ?? "").trim();
  const label = loc ? resolveProvince(loc) : "";
  return raw.replace(/\{\s*LOCATION\s*\}/gi, (label || "KHU VỰC CỦA BẠN").toUpperCase());
}

/** Tất cả khu vực (quận/huyện) thuộc tỉnh/thành user đã đăng ký. */
export function areasOfUserLocation(userLocation?: string | null): string[] {
  const loc = String(userLocation ?? "").trim();
  if (!loc) return [];
  try {
    return getDistricts(loc).filter(Boolean);
  } catch {
    return [];
  }
}

/** Trộn ngẫu nhiên (Fisher–Yates) — không đụng mảng gốc. */
function shuffle<T>(list: readonly T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Danh sách khu vực hiển thị cho user theo cấu hình của mục.
 * Luôn trả về mảng (không ném lỗi) kể cả khi location trống/không có dữ liệu.
 */
export function pickAreasForUser(userLocation?: string | null, areaLimit = 0): string[] {
  const all = areasOfUserLocation(userLocation);
  const n = Math.max(0, Math.floor(Number(areaLimit) || 0));
  if (!all.length) return [];
  if (n === 0 || n >= all.length) return all;
  return shuffle(all).slice(0, n);
}
