/**
 * Ẩn tài khoản Admin (Bang Chủ / Super Admin / Admin) khỏi mọi danh sách
 * "Tài khoản thứ hai" — Admin không phải clone, không được chọn để đăng bài,
 * bình luận hay tặng quà hàng loạt.
 */
import { supabase } from "@/lib/db/router";

const sb = supabase as any;

let cache: { ids: Set<string>; at: number } | null = null;
let inflight: Promise<Set<string>> | null = null;
// TTL dài hơn: danh sách Admin gần như không đổi trong 1 phiên làm việc.
const TTL = 5 * 60_000;

export async function fetchAdminUserIds(force = false): Promise<Set<string>> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.ids;
  if (!force && inflight) return inflight;

  const task = (async () => {
    const ids = new Set<string>();

    try {
      const { data } = await sb.from("profiles").select("id").eq("is_admin", true).limit(500);
      for (const r of data ?? []) if (r?.id) ids.add(String(r.id));
    } catch {
      /* RLS có thể chặn — bỏ qua */
    }

    try {
      const { data } = await sb.from("admin_role_assignments")
        .select("user_id")
        .or("suspended.is.null,suspended.eq.false")
        .limit(500);
      for (const r of data ?? []) if (r?.user_id) ids.add(String(r.user_id));
    } catch {
      /* bảng có thể không tồn tại */
    }

    cache = { ids, at: Date.now() };
    return ids;
  })().finally(() => { inflight = null; });

  inflight = task;
  return task;
}


export function invalidateAdminUserIds() {
  cache = null;
}

/** Lọc bỏ mọi bản ghi có id nằm trong danh sách Admin. */
export function withoutAdmins<T extends { id: string }>(rows: T[], adminIds: Set<string>): T[] {
  if (!adminIds.size) return rows;
  return rows.filter((r) => !adminIds.has(String(r.id)));
}
