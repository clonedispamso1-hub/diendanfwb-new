/**
 * daily-leaderboard — "Top tương tác trong ngày".
 *
 * Điểm được tính hoàn toàn server-side trên Supabase #3 (RPC `leaderboard_daily`),
 * gộp từ dữ liệu gốc trong ngày (giờ VN):
 *   • Đăng bài mới        : +50
 *   • Thả tim bài viết    : +2
 *   • Gửi tin nhắn        : +1
 *   • Bình luận bài NGƯỜI KHÁC: +5 (tự bình luận bài mình = 0 điểm)
 *
 * Không tạo bảng mới, không ghi dữ liệu — chỉ đọc. Tên/avatar lấy từ Supabase #1.
 * Nếu RPC chưa được cài (SQL chưa chạy) ⇒ trả mảng rỗng, KHÔNG lỗi giao diện.
 */
import { db3, supabase } from "@/lib/db/router";
import { resolveUserName } from "@/lib/user-name";
import { deriveUid } from "@/lib/user-uid";

export interface DailyLeaderRow {
  user_id: string;
  score: number;
  posts: number;
  likes: number;
  messages: number;
  comments: number;
  name: string;
  avatar: string | null;
  uid: string | null;
}

const PROFILE_COLS =
  "id, display_name, full_name, nickname, name, avatar_url, avatar, public_id";

export async function fetchDailyLeaderboard(limit = 50): Promise<DailyLeaderRow[]> {
  const { data, error } = await (db3() as any).rpc("leaderboard_daily", { _limit: limit });
  if (error) return [];

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

  return rows.map((r: any): DailyLeaderRow => {
    const id = String(r.user_id);
    const p = profiles.get(id);
    return {
      user_id: id,
      score: Number(r.score ?? 0),
      posts: Number(r.posts ?? 0),
      likes: Number(r.likes ?? 0),
      messages: Number(r.messages ?? 0),
      comments: Number(r.comments ?? 0),
      name: p ? resolveUserName(p) : "Thành viên",
      avatar: p?.avatar_url || p?.avatar || null,
      uid: p?.public_id || deriveUid(id),
    };
  });
}
