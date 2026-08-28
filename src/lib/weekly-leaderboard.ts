/**
 * weekly-leaderboard — nguồn DUY NHẤT của "Top tương tác tuần".
 *
 * Điểm được tính hoàn toàn server-side trên Supabase #3 (RPC `leaderboard_weekly`).
 * Supabase #3 KHÔNG có bảng profiles → avatar / tên / UID lấy 1 lần theo lô
 * từ Supabase #1.
 *
 * KHÔNG tạo dòng giả ("Thành viên … / 0"): không có dữ liệu ⇒ trả mảng rỗng.
 * KHÔNG lọc tài khoản clone/nội bộ của Admin — mọi tài khoản được xếp hạng như nhau.
 */
import { db3, supabase } from "@/lib/db/router";
import { resolveUserName } from "@/lib/user-name";
import { deriveUid } from "@/lib/user-uid";

export interface WeeklyLeaderRow {
  user_id: string;
  score: number;
  posts: number;
  messages: number;
  comment_days: number;
  name: string;
  avatar: string | null;
  uid: string | null;
  location: string | null;
  title_gif_url: string | null;
  created_at: string | null;
  vip_level: number | null;
  is_admin: boolean;
}

const PROFILE_COLS =
  "id, display_name, full_name, nickname, name, avatar_url, avatar, public_id, province, region, location, title_gif_url, created_at, vip_level, is_admin, role";

export async function fetchWeeklyLeaderboard(limit = 50): Promise<WeeklyLeaderRow[]> {
  const { data, error } = await (db3() as any).rpc("leaderboard_weekly", { _limit: limit });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []).filter((r: any) => r?.user_id);
  if (rows.length === 0) return [];

  const ids = rows.map((r: any) => String(r.user_id));
  const profiles = new Map<string, any>();
  try {
    const { data: profs } = await (supabase as any)
      .from("profiles")
      .select(PROFILE_COLS)
      .in("id", ids);
    (profs || []).forEach((p: any) => profiles.set(String(p.id), p));
  } catch {
    /* thiếu profile ⇒ vẫn hiển thị hàng thật, chỉ khuyết avatar/tên */
  }

  return rows.map((r: any): WeeklyLeaderRow => {
    const id = String(r.user_id);
    const p = profiles.get(id);
    return {
      user_id: id,
      score: Number(r.score ?? 0),
      posts: Number(r.posts ?? 0),
      messages: Number(r.messages ?? 0),
      comment_days: Number(r.comment_days ?? 0),
      name: p ? resolveUserName(p) : "Thành viên",
      avatar: p?.avatar_url || p?.avatar || null,
      uid: p?.public_id || deriveUid(id),
      location: p ? p.region || p.province || p.location || null : null,
      title_gif_url: p?.title_gif_url || null,
      created_at: p?.created_at ?? null,
      vip_level: p?.vip_level ?? null,
      is_admin: p?.is_admin === true || p?.role === "admin",
    };
  });
}
