/**
 * ⛔ ADMIN BULK DELETE — DISABLED BY SECURITY HARDENING
 *
 * Toàn bộ các thao tác xoá hàng loạt / xoá vĩnh viễn ở đây đã bị vô hiệu hoá.
 * Các hàm KHÔNG thực hiện bất kỳ lời gọi database nào (không RPC, không DELETE)
 * và luôn throw. Các RPC dưới database vẫn còn nguyên, chỉ không còn đường gọi
 * từ frontend/API.
 *
 * Không bật lại nếu không có phê duyệt rõ ràng của chủ hệ thống.
 */

const DISABLED = "BULK_DELETE_DISABLED";

/** ⛔ Xoá toàn bộ bài viết — đã vô hiệu hoá. */
export async function deleteAllPosts(_confirmPhrase: string): Promise<number> {
  throw new Error(`Chức năng xoá toàn bộ bài viết đã bị vô hiệu hoá (${DISABLED}).`);
}

/** ⛔ Xoá sạch nội dung của tài khoản — đã vô hiệu hoá. */
export async function wipeUsersContent(
  _userIds: string[],
): Promise<{ ok: number; failed: number }> {
  throw new Error(`Chức năng xoá sạch nội dung đã bị vô hiệu hoá (${DISABLED}).`);
}

export interface PurgeMemberResult {
  userId: string;
  done: Array<"SB1" | "SB2" | "SB3">;
  pendingSql: Array<"SB2" | "SB3">;
}

/** ⛔ Xoá vĩnh viễn 1 thành viên trên cả 3 database — đã vô hiệu hoá. */
export async function purgeMemberEverywhere(_userId: string): Promise<PurgeMemberResult> {
  throw new Error(`Chức năng xoá vĩnh viễn thành viên đã bị vô hiệu hoá (${DISABLED}).`);
}

/** ⛔ Xoá toàn bộ tài khoản (admin_purge_all_members / admin_purge_all_accounts). */
export async function purgeAllAccounts(_input: {
  confirm: string;
  adminCode: string;
}): Promise<number> {
  throw new Error("Chức năng xoá toàn bộ tài khoản đã bị vô hiệu hoá vĩnh viễn (PURGE_DISABLED).");
}
