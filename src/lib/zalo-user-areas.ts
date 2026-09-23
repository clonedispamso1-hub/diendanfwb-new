/**
 * Danh sách khu vực CỐ ĐỊNH của từng user cho mục "VIP ZALO {LOCATION}".
 *
 * - Lấy tỉnh/thành từ hồ sơ user đã đăng ký (không GPS/IP).
 * - Lần đầu: random theo `area_limit` của mục rồi LƯU vào Supabase (bảng
 *   `zalo_user_areas`), chỉ lưu ID khu vực (tên quận/huyện), không nhân bản dữ liệu.
 * - Các lần sau (F5, đóng/mở, đăng nhập lại, thiết bị khác): luôn đọc lại
 *   danh sách đã lưu, KHÔNG random lại — kể cả khi Admin đổi `area_limit`.
 */
import { sb4 } from "@/lib/supabase-v4";
import { areasOfUserLocation, pickAreasForUser } from "@/lib/zalo-location-areas";
import { resolveProvince } from "@/lib/vn-locations";

export const ZALO_USER_AREAS_TABLE = "zalo_user_areas";

/** Bảng nằm trên Supabase #4, cùng nơi lưu `zalo_sub_items_l1`. */
const sb = () => sb4() as any;

function normProvince(userLocation?: string | null): string {
  const loc = String(userLocation ?? "").trim();
  if (!loc) return "";
  try {
    return resolveProvince(loc) || loc;
  } catch {
    return loc;
  }
}

/** Đọc danh sách đã lưu (nếu có). */
export async function getSavedUserAreas(
  userId: string,
  itemId: string,
  userLocation?: string | null,
): Promise<string[] | null> {
  const province = normProvince(userLocation);
  if (!userId || !itemId || !province) return null;
  const { data, error } = await sb()
    .from(ZALO_USER_AREAS_TABLE)
    .select("area_ids")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("province", province)
    .maybeSingle();
  if (error || !data) return null;
  const list = Array.isArray(data.area_ids) ? data.area_ids.filter(Boolean) : [];
  return list.length ? list : null;
}

/**
 * Danh sách khu vực cố định của user: đọc bản đã lưu, nếu chưa có thì random
 * một lần theo `areaLimit` rồi lưu lại.
 */
export async function ensureUserAreas(
  userId: string,
  itemId: string,
  userLocation?: string | null,
  areaLimit = 0,
): Promise<string[]> {
  const province = normProvince(userLocation);
  if (!userId || !itemId || !province) return [];

  const saved = await getSavedUserAreas(userId, itemId, province);
  if (saved) return saved;

  const all = areasOfUserLocation(province);
  if (!all.length) return [];

  const picked = pickAreasForUser(province, areaLimit);
  if (!picked.length) return [];

  // upsert + ignoreDuplicates: hai tab/thiết bị mở cùng lúc vẫn chỉ có 1 bản ghi.
  await sb()
    .from(ZALO_USER_AREAS_TABLE)
    .upsert(
      { user_id: userId, item_id: itemId, province, area_ids: picked },
      { onConflict: "user_id,item_id,province", ignoreDuplicates: true },
    );

  // Luôn đọc lại bản ghi thật trong DB → mọi thiết bị thấy cùng một danh sách.
  const again = await getSavedUserAreas(userId, itemId, province);
  return again ?? picked;
}
