/**
 * use-profile-query — hồ sơ người dùng tải TỨC THÌ.
 *
 *  - TanStack Query với staleTime 5 phút (đồng bộ TTL của profile-cache).
 *  - `usePrefetchProfile()` gọi khi hover (onMouseEnter / onTouchStart) vào
 *    avatar hoặc tên bất kỳ → click là hiển thị ngay, 0s delay.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  PROFILE_UI_COLS,
  fetchProfileById,
  peekProfile,
} from "@/lib/profile-cache";

export const PROFILE_STALE_TIME = 5 * 60 * 1000;

export const profileQueryKey = (id: string | null | undefined, cols = PROFILE_UI_COLS) =>
  ["profile", cols, id ?? ""] as const;

export function profileQueryOptions(id: string | null | undefined, cols = PROFILE_UI_COLS) {
  return {
    queryKey: profileQueryKey(id, cols),
    queryFn: () => fetchProfileById(id, cols),
    staleTime: PROFILE_STALE_TIME,
    gcTime: 30 * 60 * 1000,
    initialData: id ? (peekProfile(id, cols) ?? undefined) : undefined,
  };
}

/** Hồ sơ đã cache → render ngay, không nhấp nháy "Người dùng". */
export function useProfileQuery(id: string | null | undefined, cols = PROFILE_UI_COLS) {
  return useQuery({ ...profileQueryOptions(id, cols), enabled: !!id });
}

/**
 * Trả về handler prefetch. Dùng:
 *   const prefetch = usePrefetchProfile();
 *   <img onMouseEnter={() => prefetch(userId)} onTouchStart={() => prefetch(userId)} />
 */
export function usePrefetchProfile(cols = PROFILE_UI_COLS) {
  const qc = useQueryClient();
  return useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      if (peekProfile(id, cols)) return; // đã có trong cache → khỏi gọi mạng
      void qc.prefetchQuery(profileQueryOptions(id, cols));
    },
    [qc, cols],
  );
}

/** Props tiện dụng gắn thẳng vào avatar/tên để prefetch khi rê chuột. */
export function useProfileHoverProps(cols = PROFILE_UI_COLS) {
  const prefetch = usePrefetchProfile(cols);
  return useCallback(
    (id: string | null | undefined) => ({
      onMouseEnter: () => prefetch(id),
      onTouchStart: () => prefetch(id),
      onFocus: () => prefetch(id),
    }),
    [prefetch],
  );
}
