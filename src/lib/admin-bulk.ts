import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/** RPC chưa tồn tại trên DB (PostgREST trả PGRST202 / "does not exist"). */
function isMissingRpc(error: any): boolean {
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
 * Xoá toàn bộ bài viết. Ưu tiên RPC admin_delete_all_posts; nếu DB chưa có
 * RPC thì fallback xoá trực tiếp qua bảng (RLS admin vẫn áp dụng).
 */
export async function deleteAllPosts(confirmPhrase: string): Promise<number> {
  const { data, error } = await sb.rpc("admin_delete_all_posts", { _confirm: confirmPhrase });
  if (!error) return Number(data ?? 0);
  if (!isMissingRpc(error)) throw error;

  const { count } = await sb.from("posts").select("id", { count: "exact", head: true });
  for (const table of ["likes", "comments"]) {
    await sb.from(table).delete().not("id", "is", null);
  }
  const { error: delErr } = await sb.from("posts").delete().not("id", "is", null);
  if (delErr) throw delErr;
  return Number(count ?? 0);
}

/**
 * Xoá toàn bộ NỘI DUNG của một số tài khoản (bài viết, bình luận, like, tin
 * nhắn) nhưng GIỮ tài khoản. Ưu tiên RPC admin_wipe_user_content.
 */
export async function wipeUsersContent(userIds: string[]): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const uid of userIds) {
    try {
      const { error } = await sb.rpc("admin_wipe_user_content", { p_user_id: uid });
      if (error) {
        if (!isMissingRpc(error)) throw error;
        await wipeOneUserFallback(uid);
      }
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

async function wipeOneUserFallback(uid: string) {
  const { data: posts } = await sb.from("posts").select("id").eq("user_id", uid);
  const postIds: string[] = (posts ?? []).map((p: any) => p.id);
  if (postIds.length) {
    await sb.from("likes").delete().in("post_id", postIds);
    await sb.from("comments").delete().in("post_id", postIds);
  }
  await sb.from("comments").delete().eq("user_id", uid);
  await sb.from("likes").delete().eq("user_id", uid);
  await sb.from("messages").delete().eq("sender_id", uid);
  const { error } = await sb.from("posts").delete().eq("user_id", uid);
  if (error) throw error;
}

/**
 * XÓA TOÀN BỘ TÀI KHOẢN (chỉ dùng để dọn dữ liệu TEST).
 * - Xóa vĩnh viễn dữ liệu tài khoản trong DB.
 * - KHÔNG đưa SĐT / IP / device / fingerprint vào blacklist → người dùng có
 *   thể đăng ký lại bằng chính số điện thoại đó.
 * - Không xóa table / schema / RPC / migration.
 */
export async function purgeAllAccounts(input: {
  confirm: string;
  adminPassword: string;
  adminCode: string;
}): Promise<number> {
  const { data, error } = await sb.rpc("admin_purge_all_accounts", {
    _confirm: input.confirm,
    _admin_password: input.adminPassword,
    _admin_code: input.adminCode,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
