/**
 * Nguồn dữ liệu cho popup "Hồ sơ thành viên" trong Admin Panel.
 * CHỈ ĐỌC dữ liệu/bảng đang tồn tại:
 *   • Supabase #1 (core): profiles, gem_transactions, withdrawal_requests, bangchu
 *   • Supabase #3 (logs): posts, follows
 * Không tạo bảng mới, không sinh dữ liệu giả.
 */
import { supabase, db3 } from "@/lib/db/router";
import { isUuid } from "@/lib/uuid";

export type MemberPost = {
  id: string;
  content: string | null;
  created_at: string | null;
  likes_count: number;
  comments_count: number;
  image_url: string | null;
};

export type MemberFollowUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  created_at: string | null;
};

export type GemHistoryRow = {
  id: string;
  at: string | null;
  label: string;
  amount: number;      // dương = nhận, âm = trừ đi
  counterpart: string | null;
  code: string;        // mã giao dịch (id rút gọn)
  status?: string | null;
};

const sb1 = () => supabase as any;
const sb3 = () => db3() as any;

/* ---------------- Bài viết ---------------- */
export async function fetchMemberPosts(userId: string, limit = 50): Promise<MemberPost[]> {
  const { data, error } = await sb3()
    .from("posts")
    .select("id, content, created_at, likes_count, comments_count, image_url, is_deleted")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter((p) => !p.is_deleted)
    .map((p) => ({
      id: p.id,
      content: p.content ?? null,
      created_at: p.created_at ?? null,
      likes_count: Number(p.likes_count ?? 0),
      comments_count: Number(p.comments_count ?? 0),
      image_url: p.image_url ?? null,
    }));
}

export async function countMemberPosts(userId: string): Promise<number> {
  const { count, error } = await sb3()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_deleted", false);
  if (error) return 0;
  return Number(count ?? 0);
}

/* ---------------- Follow ---------------- */
async function profilesByIds(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!ids.length) return map;
  const { data } = await sb1()
    .from("profiles")
    .select("id, username, full_name, avatar")
    .in("id", ids);
  (data ?? []).forEach((p: any) => map.set(p.id, p));
  return map;
}

async function fetchFollowSide(
  userId: string,
  side: "followers" | "following",
  limit = 100,
): Promise<MemberFollowUser[]> {
  const keyEq = side === "followers" ? "following_id" : "follower_id";
  const keyPick = side === "followers" ? "follower_id" : "following_id";
  const { data, error } = await sb3()
    .from("follows")
    .select("follower_id, following_id, created_at")
    .eq(keyEq, userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const profiles = await profilesByIds(rows.map((r) => r[keyPick]));
  return rows.map((r) => {
    const p = profiles.get(r[keyPick]);
    return {
      id: r[keyPick],
      username: p?.username ?? null,
      full_name: p?.full_name ?? null,
      avatar: p?.avatar ?? null,
      created_at: r.created_at ?? null,
    };
  });
}

export const fetchMemberFollowers = (id: string) => fetchFollowSide(id, "followers");
export const fetchMemberFollowing = (id: string) => fetchFollowSide(id, "following");

export async function countFollows(userId: string): Promise<{ followers: number; following: number }> {
  const [a, b] = await Promise.all([
    sb3().from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    sb3().from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: Number(a?.count ?? 0), following: Number(b?.count ?? 0) };
}

/* ---------------- Lịch sử Gem ---------------- */
const KIND_LABEL: Record<string, string> = {
  transfer: "Chuyển tiền",
  gift: "Tặng quà",
  lucky_money: "Lì xì",
  red_packet: "Lì xì",
  reward: "Thưởng",
  topup: "Nạp xu",
  withdraw: "Rút tiền",
};

export async function fetchGemHistory(userId: string, limit = 60): Promise<GemHistoryRow[]> {
  const out: GemHistoryRow[] = [];

  const { data: tx } = await sb1()
    .from("gem_transactions")
    .select("id, sender_id, receiver_id, amount, kind, created_at")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  const others = new Set<string>();
  (tx ?? []).forEach((t: any) => {
    const other = t.sender_id === userId ? t.receiver_id : t.sender_id;
    if (other) others.add(other);
  });
  const profiles = await profilesByIds(Array.from(others));

  (tx ?? []).forEach((t: any) => {
    const received = t.receiver_id === userId;
    const other = received ? t.sender_id : t.receiver_id;
    const p = other ? profiles.get(other) : null;
    const base = KIND_LABEL[String(t.kind ?? "")] || String(t.kind ?? "Giao dịch");
    out.push({
      id: t.id,
      at: t.created_at ?? null,
      label: received ? `Nhận · ${base}` : `Chuyển đi · ${base}`,
      amount: received ? Number(t.amount ?? 0) : -Number(t.amount ?? 0),
      counterpart: p ? `@${p.username ?? p.full_name ?? other.slice(0, 8)}` : (other ? other.slice(0, 8) : null),
      code: String(t.id).slice(0, 8),
    });
  });

  // Cột user_id là uuid → chỉ query khi userId đúng định dạng UUID,
  // tránh lỗi Postgres 42883 "operator does not exist: uuid = text".
  const { data: wd } = isUuid(userId)
    ? await sb1()
        .from("withdrawal_requests")
        .select("id, user_id, amount, status, created_at, bank_name, bank_account")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit)
    : { data: [] as any[] };

  (wd ?? []).forEach((w: any) => {
    out.push({
      id: w.id,
      at: w.created_at ?? null,
      label: "Rút tiền",
      amount: -Number(w.amount ?? 0),
      counterpart: [w.bank_name, w.bank_account].filter(Boolean).join(" · ") || null,
      code: String(w.id).slice(0, 8),
      status: w.status ?? null,
    });
  });

  return out.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
}

/* ---------------- Lọc tài khoản hệ thống ra khỏi danh sách ---------------- */
let bangchuIds: Set<string> | null = null;

/** UID của tài khoản Admin/Bang chủ — không phải thành viên thật. */
export async function loadBangchuIds(force = false): Promise<Set<string>> {
  if (bangchuIds && !force) return bangchuIds;
  try {
    const { data } = await sb1().from("bangchu").select("auth_user_id, user_id").limit(500);
    const s = new Set<string>();
    (data ?? []).forEach((r: any) => {
      if (r.auth_user_id) s.add(r.auth_user_id);
      if (r.user_id) s.add(r.user_id);
    });
    bangchuIds = s;
  } catch {
    bangchuIds = new Set();
  }
  return bangchuIds;
}

/** true nếu là tài khoản hệ thống Admin Panel (bangchu / clone / chatdel-*). */
export function isSystemAccount(row: any, ids: Set<string>): boolean {
  if (ids.has(row.id)) return true;
  const u = String(row.username ?? "").toLowerCase();
  const email = String(row.email ?? "").toLowerCase();
  if (email.endsWith("@admin.candy.local")) return true;
  if (/^chatdel[-_]/.test(u)) return true;
  if (/^bangchu\d*$/.test(u)) return true;
  if (String(row.account_source ?? "") === "internal") return true;
  return Boolean(
    row.is_clone || row.is_internal || row.is_virtual || row.is_seed_account || row.is_bot,
  );
}

