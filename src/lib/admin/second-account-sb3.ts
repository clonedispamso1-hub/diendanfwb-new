/**
 * 🔀 Cầu nối Supabase #3 cho khu "Tài khoản thứ hai" (admin-v3).
 *
 * Sau migration: `posts`, `comments`, `messages`, `notifications` nằm ở
 * Supabase #3. Ví xu / profiles / auth vẫn ở Supabase #1.
 *
 * Mọi truy vấn ở đây đều đi qua Database Router (`db3()` / `db()`), tuyệt đối
 * KHÔNG import `createClient` trực tiếp.
 */
import { db, db3 } from "@/lib/db/router";

const s3 = () => db3() as any;
const profilesDb = () => db("profiles") as any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asUuid = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return UUID_RE.test(s) ? s : null;
};

/* ------------------------------------------------------------------ */
/* Profiles (Supabase #1) — dùng để hiển thị tên/avatar cho dữ liệu #3 */
/* ------------------------------------------------------------------ */

export type ProfileLite = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export async function fetchProfilesLite(ids: string[]): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>();
  const uniq = Array.from(new Set(ids.filter((id) => asUuid(id))));
  if (!uniq.length) return map;

  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const { data } = await profilesDb()
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", chunk);
    for (const row of (data ?? []) as ProfileLite[]) map.set(row.id, row);
  }
  return map;
}


/* ------------------------------------------------------------------ */
/* TAB 2 — Đăng bài Clone (posts ở Supabase #3)                        */
/* ------------------------------------------------------------------ */

export interface ClonePostInput {
  accountId: string;
  content: string;
  imageUrls?: string[] | null;
  visibility?: string;
  facebookUrl?: string | null;
  zaloUrl?: string | null;
}

/** Trạng thái bài (tồn tại / đã xoá mềm) cho nút dọn Tym mô phỏng. Lô 200 id, chỉ khi Admin bấm. */
export async function fetchPostStatesSb3(ids: string[]): Promise<Map<string, { deleted: boolean }>> {
  const map = new Map<string, { deleted: boolean }>();
  const uniq = Array.from(new Set(ids.filter((id) => asUuid(id))));
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    let { data, error } = await s3().from("posts").select("id, deleted_at").in("id", chunk);
    if (error && /deleted_at/i.test(String(error.message))) {
      ({ data, error } = await s3().from("posts").select("id").in("id", chunk));
    }
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as any[]) map.set(String(row.id), { deleted: Boolean(row.deleted_at) });
  }
  return map;
}

/** Tạo bài viết của clone TRỰC TIẾP trên Supabase #3 (Feed đọc từ #3). */
export async function createClonePostSb3(input: ClonePostInput): Promise<string> {
  const userId = asUuid(input.accountId);
  if (!userId) throw new Error("Tài khoản clone không hợp lệ");

  const imageUrls = input.imageUrls && input.imageUrls.length ? input.imageUrls : null;
  const payload: Record<string, any> = {
    user_id: userId,
    content: input.content,
    image_url: imageUrls?.[0] ?? null,
    image_urls: imageUrls,
    visibility: input.visibility ?? "home",
    status: "published",
    has_images: Boolean(imageUrls?.length),
    category: "general",
    is_anonymous: false,
  };
  if (input.facebookUrl) payload.facebook_url = input.facebookUrl;
  if (input.zaloUrl) payload.zalo_url = input.zaloUrl;

  const { data, error } = await s3().from("posts").insert([payload]).select("id").single();
  if (error) throw new Error(error.message);
  return (data as any)?.id as string;
}

/* ------------------------------------------------------------------ */
/* TAB 3 — Bài viết + bình luận (posts/comments ở Supabase #3)         */
/* ------------------------------------------------------------------ */

export type Sb3PostRow = {
  id: string;
  content: string | null;
  created_at: string | null;
  author_id: string;
  author_username: string | null;
  author_name: string | null;
  author_avatar: string | null;
};

export interface FetchPostsOptions {
  search?: string | null;
  since?: string | null;
  limit?: number;
  /** id clone — dùng để loại bài của clone khi `includeClones = false`. */
  cloneIds?: string[];
  includeClones?: boolean;
}

/** Đọc danh sách bài viết từ Supabase #3 + hydrate tác giả từ Supabase #1. */
export async function fetchPostsSb3(opts: FetchPostsOptions = {}): Promise<Sb3PostRow[]> {
  const limit = opts.limit ?? 300;
  let query = s3()
    .from("posts")
    .select("id, user_id, content, created_at")
    .is("deleted_at", null)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.since) query = query.gte("created_at", opts.since);
  if (opts.search) query = query.ilike("content", `%${opts.search}%`);


  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as any[];
  if (opts.includeClones === false && opts.cloneIds?.length) {
    const clones = new Set(opts.cloneIds);
    rows = rows.filter((r) => !clones.has(r.user_id));
  }

  const profiles = await fetchProfilesLite(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const p = profiles.get(r.user_id);
    return {
      id: r.id,
      content: r.content ?? null,
      created_at: r.created_at ?? null,
      author_id: r.user_id,
      author_username: p?.username ?? null,
      author_name: p?.full_name ?? null,
      author_avatar: p?.avatar_url ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* TAB 4 — Tin nhắn clone (messages ở Supabase #3)                     */
/* ------------------------------------------------------------------ */

/** Gửi tin nhắn của clone tới user thật — toàn bộ ở Supabase #3. */
export async function broadcastCloneMessagesSb3(
  accountIds: string[],
  peerIds: string[],
  content: string,
  imageUrl?: string | null,
): Promise<number> {
  const rows: Array<Record<string, any>> = [];
  for (const accountId of accountIds) {
    const sender = asUuid(accountId);
    if (!sender) continue;
    for (const peerId of peerIds) {
      const receiver = asUuid(peerId);
      if (!receiver) continue;
      const row: Record<string, any> = { sender_id: sender, receiver_id: receiver, content };
      if (imageUrl) row.image_url = imageUrl;
      rows.push(row);
    }
  }
  if (!rows.length) return 0;

  const { error } = await s3().from("messages").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Tổng số tin chưa đọc gửi tới các clone (đọc từ Supabase #3). */
export async function fetchCloneUnreadTotalSb3(cloneIds: string[]): Promise<number> {
  const ids = cloneIds.filter((id) => asUuid(id));
  if (!ids.length) return 0;
  const { count, error } = await s3()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("receiver_id", ids)
    .eq("is_read", false);
  if (error) return 0;
  return Number(count ?? 0);
}
