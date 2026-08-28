/**
 * Fallback cho Quản lý thành viên khi RPC `admin_list_members` chưa tồn tại
 * trên Supabase #1 (lỗi PGRST202 / "Could not find the function ...").
 *
 * Chỉ ĐỌC bảng `profiles` + `user_restrictions` bằng client hiện tại
 * (RLS admin vẫn áp dụng). Không tạo bảng, không sửa dữ liệu, không đổi API.
 * Khi migration RPC được chạy, code tự động dùng lại RPC.
 */
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

export type MemberListParams = {
  q?: string | null;
  status: string;
  from?: string | null;
  to?: string | null;
  limit: number;
  offset: number;
};

export type MemberListRow = {
  id: string;
  public_id: string | null;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  is_online: boolean | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
  banned_until: string | null;
  role: string | null;
  followers_count: number | null;
  posts_count: number;
  following_count: number;
  violation_count: number;
  fingerprint: string | null;
  ip: string | null;
  user_agent: string | null;
  total_count: number;
};

/** true nếu lỗi là "RPC chưa tồn tại trong schema". */
export function isMissingRpc(err: any): boolean {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? "");
  return code === "PGRST202" || /Could not find the function/i.test(msg);
}

/**
 * true nếu RPC lỗi do so sánh uuid với text
 * ("operator does not exist: uuid = text") → dùng fallback đọc trực tiếp.
 */
export function isUuidTextMismatch(err: any): boolean {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? "") + " " + String(err?.details ?? "");
  return code === "42883" || /operator does not exist:\s*uuid\s*=\s*text/i.test(msg);
}

const COLS =
  "id, public_id, full_name, username, avatar, phone, created_at, last_seen, is_online, is_admin, is_banned, banned_until, role, followers_count";

/**
 * Loại trừ ngay ở tầng query: clone / internal / seed / bot / tài khoản ảo.
 * Cột nào không tồn tại trên DB → Postgres báo lỗi, hàm gọi sẽ retry không lọc.
 */
function excludeFakeAccounts(q: any): any {
  return q
    .or("account_source.is.null,account_source.neq.internal")
    .or("is_clone.is.null,is_clone.eq.false")
    .or("is_virtual.is.null,is_virtual.eq.false")
    .or("is_seed_account.is.null,is_seed_account.eq.false");
}


function todayStartISO(): string {
  // Đầu ngày theo giờ VN (UTC+7).
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  vn.setUTCHours(0, 0, 0, 0);
  return new Date(vn.getTime() - 7 * 3600_000).toISOString();
}

export async function listMembersFallback(p: MemberListParams): Promise<MemberListRow[]> {
  const sb = supabase as any;

  // Danh sách user có vi phạm (dùng cho filter "violation" + cột số vi phạm).
  const { data: restr } = await sb.from("user_restrictions").select("user_id");
  const vio = new Map<string, number>();
  (restr ?? []).forEach((r: any) => vio.set(r.user_id, (vio.get(r.user_id) ?? 0) + 1));

  const build = (excludeFake: boolean) => {
    let query = sb.from("profiles").select(COLS, { count: "exact" });
    if (excludeFake) query = excludeFakeAccounts(query);

    const term = (p.q ?? "").trim();
    if (term) {
      // `id` là cột UUID → chỉ so sánh khi term đúng định dạng UUID,
      // nếu không Postgres báo "operator does not exist: uuid = text".
      if (isUuid(term)) {
        query = query.eq("id", term);
      } else {
        query = query.or(
          `username.ilike.%${term}%,full_name.ilike.%${term}%,public_id.ilike.%${term}%,phone.ilike.%${term}%`,
        );
      }
    }
    if (p.from) query = query.gte("created_at", p.from);
    if (p.to) query = query.lte("created_at", p.to);

    switch (p.status) {
      case "admin": query = query.eq("is_admin", true); break;
      case "user": query = query.eq("is_admin", false); break;
      case "banned": query = query.eq("is_banned", true); break;
      case "active": query = query.gte("last_seen", todayStartISO()); break;
      case "violation": {
        const ids = Array.from(vio.keys());
        query = query.in("id", ids);
        break;
      }
      default: break;
    }

    query =
      p.status === "active"
        ? query.order("last_seen", { ascending: false, nullsFirst: false })
        : query.order("created_at", { ascending: false });

    return query.range(p.offset, p.offset + p.limit - 1);
  };

  if (p.status === "violation" && vio.size === 0) return [];

  let { data, error, count } = await build(true);
  if (error) {
    // Cột lọc chưa tồn tại trên DB này → thử lại không lọc (frontend vẫn lọc tiếp).
    ({ data, error, count } = await build(false));
  }
  if (error) throw error;


  const total = Number(count ?? 0);
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    posts_count: 0,
    following_count: 0,
    violation_count: vio.get(r.id) ?? 0,
    fingerprint: null,
    ip: null,
    user_agent: null,
    total_count: total,
  })) as MemberListRow[];
}
