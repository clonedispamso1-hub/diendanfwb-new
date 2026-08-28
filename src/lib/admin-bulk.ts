import { supabase } from "@/lib/supabase";
import { chatDb } from "@/lib/chat-db";
import { getInstanceClient } from "@/lib/db/router";

const sb = supabase as any;

/** Supabase #2 (media / VIP). */
const sb2 = () => getInstanceClient("media") as any;
/** Supabase #3 (logs / posts / comments / chat). */
const sb3 = () => getInstanceClient("logs") as any;

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
  await chatDb().from("messages").delete().eq("sender_id", uid);
  const { error } = await sb.from("posts").delete().eq("user_id", uid);
  if (error) throw error;
}

/* ==================================================================== */
/* XOÁ THÀNH VIÊN TRÊN CẢ 3 DATABASE                                    */
/* ==================================================================== */

export interface PurgeMemberResult {
  userId: string;
  /** DB nào đã dọn xong (SB1 luôn bắt buộc thành công). */
  done: Array<"SB1" | "SB2" | "SB3">;
  /** DB chưa có RPC (chưa chạy file SQL tương ứng) → cần chạy SQL. */
  pendingSql: Array<"SB2" | "SB3">;
}

/**
 * Dọn dữ liệu của 1 user trên một database phụ (#2 / #3).
 * - Chưa cài RPC → trả "pending" thay vì làm hỏng luồng xoá.
 * - Lỗi thật (FK, quyền, PURGE_INCOMPLETE) → throw để Admin thấy ngay.
 */
async function purgeOnSecondary(
  client: any,
  db: "SB2" | "SB3",
  userId: string,
): Promise<"done" | "pending"> {
  const { error } = await client.rpc("admin_purge_member_full", { p_user_id: userId });
  if (!error) return "done";
  if (isMissingRpc(error)) return "pending";
  throw new Error(`${db}: ${error.message || error}`);
}

/**
 * XOÁ VĨNH VIỄN 1 THÀNH VIÊN TRÊN CẢ 3 DATABASE.
 *
 * Thứ tự: SB1 (core/auth) → SB2 (media/VIP) → SB3 (posts/chat/logs).
 * Mỗi DB tự kiểm tra: không xoá Admin, dọn con theo FK (không mồ côi),
 * và tự kiểm tra sót dữ liệu sau khi xoá.
 *
 * KHÔNG cần XOAHETDI / 792006 — hai mã đó chỉ dùng cho "Xoá tất cả".
 */
export async function purgeMemberEverywhere(userId: string): Promise<PurgeMemberResult> {
  if (!userId) throw new Error("Thiếu user id");

  const done: PurgeMemberResult["done"] = [];
  const pendingSql: PurgeMemberResult["pendingSql"] = [];

  // 1) SB1 — core: profile, auth, ví gem, bảo mật. Lỗi ở đây là lỗi thật.
  const { error: e1 } = await sb.rpc("admin_purge_member_full", { p_user_id: userId });
  if (e1) {
    if (!isMissingRpc(e1)) throw new Error(`SB1: ${e1.message || e1}`);
    const alias = await sb.rpc("admin_delete_user_data", { p_user_id: userId });
    if (alias.error) throw new Error(`SB1: ${alias.error.message || alias.error}`);
  }
  done.push("SB1");

  // 2) SB2 — media / Live Móc / Cộng Đồng VIP.
  if ((await purgeOnSecondary(sb2(), "SB2", userId)) === "done") done.push("SB2");
  else pendingSql.push("SB2");

  // 3) SB3 — posts, comments, chat, notifications, stats.
  if ((await purgeOnSecondary(sb3(), "SB3", userId)) === "done") done.push("SB3");
  else pendingSql.push("SB3");

  return { userId, done, pendingSql };
}

/**
 * XÓA TOÀN BỘ TÀI KHOẢN THÀNH VIÊN TRÊN CẢ 3 DATABASE.
 * - Cần ĐÚNG CẢ 2: mật khẩu xác nhận XOAHETDI + mã Admin 792006.
 * - Danh sách member lấy từ SB1 (loại Admin), gửi sang #2 / #3 để dọn trước,
 *   sau đó SB1 xoá profile + auth.users → không để FK mồ côi.
 * - KHÔNG xóa Admin hay dữ liệu Admin.
 * - Không xóa table / schema / RPC / migration.
 */
export async function purgeAllAccounts(input: {
  confirm: string;
  adminCode: string;
}): Promise<number> {
  const confirm = input.confirm.trim().toUpperCase();
  const adminCode = input.adminCode.trim();
  if (confirm !== "XOAHETDI") throw new Error("Mật khẩu xác nhận không đúng");
  if (adminCode !== "792006") throw new Error("Mã Admin không đúng");

  // 1) Lấy danh sách member (không Admin) từ SB1 để #2 / #3 biết cần dọn ai.
  let memberIds: string[] = [];
  const { data: rows } = await sb.from("profiles").select("id, is_admin");
  memberIds = (rows ?? [])
    .filter((r: any) => !r?.is_admin)
    .map((r: any) => String(r.id))
    .filter(Boolean);

  // 2) Dọn #2 rồi #3 trước (dữ liệu con), bỏ qua nếu chưa chạy file SQL.
  for (const [client, name] of [
    [sb2(), "SB2"],
    [sb3(), "SB3"],
  ] as const) {
    const { error } = await client.rpc("admin_purge_all_members", {
      _confirm: confirm,
      _admin_code: adminCode,
      p_user_ids: memberIds,
    });
    if (error && !isMissingRpc(error)) throw new Error(`${name}: ${error.message || error}`);
  }

  // 3) SB1 sau cùng: profile + auth.users, giữ nguyên Admin.
  const { data, error } = await sb.rpc("admin_purge_all_accounts", {
    _confirm: confirm,
    _admin_code: adminCode,
  });
  if (error) throw new Error(`SB1: ${error.message || error}`);
  return Number(data ?? memberIds.length);
}
