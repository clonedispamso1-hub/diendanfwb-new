/**
 * Đọc danh sách khu vực CỐ ĐỊNH của user cho mục "VIP ZALO {LOCATION}".
 *
 * - KHÔNG random trong render: random (nếu chưa có) chỉ xảy ra 1 lần trong
 *   queryFn, rồi lưu Supabase; các lần sau chỉ đọc lại.
 */
import { useQuery } from "@tanstack/react-query";
import { ensureUserAreas } from "@/lib/zalo-user-areas";

export function zaloUserAreasKey(userId?: string | null, itemId?: string | null, province?: string | null) {
  return ["zalo-user-areas", userId ?? "", itemId ?? "", province ?? ""] as const;
}

export function useZaloUserAreas(opts: {
  userId?: string | null;
  itemId?: string | null;
  location?: string | null;
  areaLimit?: number;
}) {
  const { userId, itemId, location, areaLimit = 0 } = opts;
  return useQuery({
    queryKey: zaloUserAreasKey(userId, itemId, location),
    queryFn: () => ensureUserAreas(String(userId), String(itemId), location, areaLimit),
    enabled: !!userId && !!itemId && !!String(location ?? "").trim(),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
