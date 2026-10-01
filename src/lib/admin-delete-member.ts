/**
 * Xoá thành viên phía máy chủ (service_role): auth.users trước → profiles
 * theo cascade. Frontend KHÔNG BAO GIỜ tự DELETE bảng profiles nữa, để
 * không còn tình trạng profiles mất nhưng auth.users còn (SĐT bị kẹt).
 */
import { supabase, supabaseAdminSession } from "@/lib/db/router";
import { deleteMemberFn } from "@/lib/admin-purge.functions";

async function adminToken(): Promise<string> {
  const a = (await supabaseAdminSession.auth.getSession()).data.session?.access_token;
  if (a) return a;
  return (await supabase.auth.getSession()).data.session?.access_token ?? "";
}

export async function deleteMemberAccount(userId: string): Promise<void> {
  const token = await adminToken();
  if (!token) throw new Error("Cần đăng nhập admin để xoá thành viên.");
  const res = await deleteMemberFn({ data: { token, userId } });
  if (!res.ok) throw new Error(res.error);
}
