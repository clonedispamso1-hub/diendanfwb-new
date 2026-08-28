/**
 * CACHE FOLLOW-SET (chống N+1 trong Feed).
 *
 * Trước đây mỗi post card tự chạy 1 query `follows` để biết "mình đã follow
 * tác giả chưa" → 1 trang feed 20 bài = 20 query. Module này tải MỘT LẦN toàn
 * bộ danh sách following của người xem rồi phục vụ mọi component từ bộ nhớ.
 *
 * - 1 query duy nhất cho mỗi phiên (TTL 5 phút), có gộp request song song.
 * - Tự cập nhật khi có sự kiện `nfwb:follow-change` (follow/unfollow) nên
 *   trạng thái UI không đổi so với trước.
 */
import { supabase } from "@/lib/supabase";

const TTL = 5 * 60_000;

let ownerId: string | null = null;
let set: Set<string> = new Set();
let loadedAt = 0;
let inflight: Promise<Set<string>> | null = null;

function reset(meId: string) {
  ownerId = meId;
  set = new Set();
  loadedAt = 0;
  inflight = null;
}

/** Danh sách following của người xem — 1 query duy nhất, dùng lại cho mọi card. */
export async function getFollowingSet(meId: string): Promise<Set<string>> {
  if (!meId) return new Set();
  if (ownerId !== meId) reset(meId);
  if (loadedAt && Date.now() - loadedAt < TTL) return set;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", meId);
    if (!error) {
      set = new Set<string>(((data as any[]) || []).map((r) => r.following_id).filter(Boolean));
      loadedAt = Date.now();
    }
    inflight = null;
    return set;
  })();

  return inflight;
}

/**
 * Invalidate + refetch cùng 1 query (bỏ TTL, vẫn gộp request song song).
 * Gọi sau khi follow/unfollow để cache dùng chung đồng bộ lại với DB.
 */
export function refreshFollowingSet(meId: string): Promise<Set<string>> {
  if (!meId) return Promise.resolve(new Set());
  if (ownerId === meId) loadedAt = 0;
  return getFollowingSet(meId);
}

/** Trạng thái đã nạp sẵn (không gây query). `undefined` = chưa biết. */
export function peekFollowing(meId: string, targetId: string): boolean | undefined {
  if (!meId || ownerId !== meId || !loadedAt) return undefined;
  return set.has(targetId);
}

/** Cập nhật cache khi user bấm follow / unfollow (optimistic, không query lại). */
export function setFollowingCached(targetId: string, following: boolean) {
  if (!loadedAt) return;
  if (following) set.add(targetId);
  else set.delete(targetId);
}

/** Xoá cache (đổi tài khoản / đăng xuất). */
export function clearFollowingCache() {
  ownerId = null;
  set = new Set();
  loadedAt = 0;
  inflight = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("nfwb:follow-change", (e: Event) => {
    const d = (e as CustomEvent<{ targetId?: string; following?: boolean; actorId?: string | null }>).detail;
    if (!d || !d.targetId || typeof d.following !== "boolean") return;
    // Chỉ áp dụng sự kiện của CHÍNH người đang đăng nhập (actorId khớp owner),
    // hoặc sự kiện legacy không rõ actor. Realtime global bắn cả hành động của
    // người khác — nếu không lọc sẽ làm bẩn follow-set của mình.
    if (d.actorId && ownerId && d.actorId !== ownerId) return;
    setFollowingCached(d.targetId, d.following);
  });
}
