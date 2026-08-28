/**
 * admin-posts — thao tác quản trị bài viết (SOFT DELETE).
 *
 * Bảng `posts` đã cutover sang Supabase #3, nên RPC phải gọi trên ĐÚNG client
 * chứa posts (`read3()`), không gọi trên client core (#1). Nếu DB chưa có RPC
 * thì fallback UPDATE trực tiếp trên bảng.
 *
 * NGUYÊN TẮC: xóa bài = soft delete (chỉ set `deleted_at`).
 * KHÔNG xóa comments / likes / messages.
 */
import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";
import { isAdminNow } from "@/lib/admin-db";

export const DELETE_ALL_PHRASE = "XOAHETDI";

/** RPC chưa tồn tại trên DB (PostgREST trả PGRST202 / "does not exist"). */
export function isMissingRpc(error: any): boolean {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

/**
 * RPC trả 'forbidden' vì Supabase #3 KHÔNG xác thực được JWT của #1
 * (auth.uid() = NULL trên #3 → adm_is_admin() = false). Trường hợp này phải
 * fallback sang UPDATE trực tiếp (đi qua anon-bridge policy của #3) SAU KHI
 * đã xác thực admin ở #1 bằng isAdminNow().
 */
export function isForbidden(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("forbidden") ||
    msg.includes("permission denied") ||
    String(error?.code || "") === "42501"
  );
}

/** Có thể tự xử lý bằng fallback trực tiếp trên bảng? */
const canFallback = (error: any) => isMissingRpc(error) || isForbidden(error);

/**
 * XÁC THỰC ADMIN (bắt buộc) — kiểm tra trên Supabase #1, nơi có session +
 * bảng bangchu/profiles. User thường KHÔNG bao giờ đi qua được hàm này.
 */
async function ensureAdmin(): Promise<void> {
  const ok = await isAdminNow();
  if (!ok) throw new Error("forbidden: bạn không phải Admin hoặc phiên Admin đã hết hạn.");
}

/** Gọi RPC trên database đang chứa `posts` (#3), fallback sang core (#1). */
export async function postsRpc(fn: string, args: Record<string, any>) {
  const first = await (read3() as any).rpc(fn, args);
  if (!first.error) return first;
  if (!isMissingRpc(first.error)) return first;
  return await (supabase as any).rpc(fn, args);
}

/** Bảng posts nằm trên Supabase #3 → phải dùng client #3. */
const postsTable = () => (read3().from("posts") as any);

/** Soft delete 1 bài viết. */
export async function softDeletePost(postId: string, reason?: string | null): Promise<void> {
  await ensureAdmin();
  const { error } = await postsRpc("admin_soft_delete_post", {
    p_post_id: postId,
    p_reason: reason?.trim() || null,
  });
  if (!error) return;
  if (!canFallback(error)) throw error;
  const { error: e2 } = await postsTable()
    .update({ deleted_at: new Date().toISOString(), delete_reason: reason?.trim() || null })
    .eq("id", postId);
  if (e2) throw e2;
}

/** Khôi phục 1 bài viết. */
export async function restorePost(postId: string): Promise<void> {
  await ensureAdmin();
  const { error } = await postsRpc("admin_restore_post", { p_post_id: postId });
  if (!error) return;
  if (!canFallback(error)) throw error;
  const { error: e2 } = await postsTable()
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq("id", postId);
  if (e2) throw e2;
}

/** Xóa vĩnh viễn 1 bài viết (chỉ dùng trong thùng rác). */
export async function purgePost(postId: string): Promise<void> {
  await ensureAdmin();
  const { error } = await postsRpc("admin_purge_post", { p_post_id: postId });
  if (!error) return;
  if (!canFallback(error)) throw error;
  const { error: e2 } = await postsTable().delete().eq("id", postId);
  if (e2) throw e2;
}

/**
 * SOFT DELETE TOÀN BỘ bài viết đang hiển thị.
 * Không đụng tới comments / likes / messages — mọi bài đều khôi phục được
 * trong tab "Bài viết đã xóa".
 */
export async function softDeleteAllPosts(
  confirmPhrase: string,
  reason = "Admin xóa toàn bộ",
): Promise<number> {
  if (confirmPhrase.trim().toUpperCase() !== DELETE_ALL_PHRASE) {
    throw new Error("Mật mã xác nhận không đúng.");
  }
  await ensureAdmin();

  const { data, error } = await postsRpc("admin_soft_delete_all_posts", {
    _confirm: confirmPhrase,
    _reason: reason,
  });
  if (!error) return Number(data ?? 0);
  if (!canFallback(error)) throw error;

  // Fallback: UPDATE trực tiếp trên Supabase #3 (anon-bridge policy).
  const { count } = await postsTable()
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const { error: updErr } = await postsTable()
    .update({ deleted_at: new Date().toISOString(), delete_reason: reason })
    .is("deleted_at", null);
  if (updErr) throw updErr;
  return Number(count ?? 0);
}

