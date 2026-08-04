/**
 * Helpers cho seed account (nick hệ thống) ở module "Tìm FWB lân cận".
 *
 * Seed account KHÔNG lưu location thật. Khi hiển thị, location được adapt
 * theo viewer (người đang xem) — cùng một seed account sẽ "ở" TP HCM với
 * viewer ở TP HCM, và "ở" Hà Nội với viewer ở Hà Nội.
 *
 * Khoảng cách giả lập (1/2/3/5/7 km) cũng được giữ ỔN ĐỊNH theo cặp
 * (seedId, viewerId) để reload không random liên tục.
 */

export interface SeedDisplayUser {
  id: string;
  location?: string | null;
  province?: string | null;
  is_seed_account?: boolean | null;
}

/** Trả về location để hiển thị cho user (seed → location của viewer). */
export function getDisplayLocation(
  user: SeedDisplayUser,
  viewerLocation: string | null | undefined,
): string {
  if (user.is_seed_account) {
    return viewerLocation || user.location || user.province || "Gần bạn";
  }
  return user.location || user.province || "Chưa rõ khu vực";
}

/** Hash ổn định từ chuỗi → số nguyên không âm (djb2). */
function stableHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

const SEED_DISTANCE_BUCKETS = [1, 2, 3, 5, 7];

/**
 * Khoảng cách giả lập theo km, ổn định theo cặp (userId, viewerId).
 * Dùng cho seed account hoặc khi không có toạ độ thật.
 */
export function getSeedDistance(userId: string, viewerId: string | null | undefined): number {
  const key = `${userId}::${viewerId || "anon"}`;
  const h = stableHash(key);
  return SEED_DISTANCE_BUCKETS[h % SEED_DISTANCE_BUCKETS.length];
}

/** Label kiểu app hẹn hò: "Cách bạn ~3km", "Gần khu vực của bạn". */
export function getDistanceLabel(userId: string, viewerId: string | null | undefined): string {
  const km = getSeedDistance(userId, viewerId);
  if (km <= 2) return "Gần khu vực của bạn";
  return `Cách bạn ~${km}km`;
}
