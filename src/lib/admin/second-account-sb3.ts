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
/* TAB 1 — Thông báo quà tặng (notifications ở Supabase #3)            */
/* ------------------------------------------------------------------ */

export interface GiftNotificationInput {
  /** id bản ghi quà trả về từ RPC tài chính ở SB1 (post_gifts.id) — idempotency key. */
  giftId?: string | null;
  receiverId: string;
  senderId?: string | null;
  senderName?: string | null;
  postId?: string | null;
  giftKey: string;
  giftName: string;
  giftEmoji?: string | null;
  amount: number;
}

/**
 * Ghi thông báo quà sang Supabase #3 QUA RPC `notify_post_gift_v5`
 * (SECURITY DEFINER — đúng quyền backend, idempotent theo gift_id).
 *
 * ⚠️ KHÔNG insert trực tiếp vào `public.notifications`: policy RESTRICTIVE
 * `notif_no_client_gift_insert` (SB3_GIFT_NOTIFICATIONS_V4) chặn mọi INSERT
 * notification loại gift% từ client → lỗi RLS 42501. Không nới RLS phía client,
 * dùng đúng RPC như luồng tặng quà của website (src/lib/gift-send.ts).
 *
 * Không ném lỗi ra ngoài để một thông báo hỏng không chặn cả lô tặng quà.
 */
export async function insertGiftNotificationSb3(
  input: GiftNotificationInput,
): Promise<{ ok: boolean; error?: string }> {
  const receiverId = asUuid(input.receiverId);
  if (!receiverId) return { ok: false, error: "receiver_invalid" };
  const giftId = asUuid(input.giftId);
  if (!giftId) return { ok: false, error: "gift_id_invalid" };

  const emoji = input.giftEmoji || "🎁";
  const amount = Number(input.amount || 0);
  const title = `${emoji} ${input.senderName || "Ai đó"} đã tặng bạn một ${input.giftName}.`;
  const message = `Giá trị ${amount.toLocaleString("vi-VN")} xu. Bấm Nhận để cộng vào ví.`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await s3().rpc("notify_post_gift_v5", {
        p_gift_id: giftId,
        p_receiver_id: receiverId,
        p_actor_id: asUuid(input.senderId),
        p_post_id: asUuid(input.postId),
        p_gift_key: input.giftKey,
        p_amount: amount,
        p_title: title,
        p_message: message,
        p_data: {
          gift_name: input.giftName,
          emoji,
          sender_name: input.senderName ?? null,
        },
      });
      if (!error) return { ok: true };
      if (attempt === 1) return { ok: false, error: error.message };
    } catch (e: any) {
      if (attempt === 1) return { ok: false, error: e?.message || "notification_failed" };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, error: "notification_failed" };
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
  comments_count: number;
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
    .select("id, user_id, content, created_at, comments_count")
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
      comments_count: Number(r.comments_count ?? 0),
    };
  });
}

/**
 * Chèn bình luận của clone vào Supabase #3.
 * Mỗi cặp (bài viết × clone) lấy 1 nội dung xoay vòng — giữ nguyên hành vi cũ
 * của RPC `admin_internal_comment_many`.
 */
export async function insertCloneCommentsSb3(
  postIds: string[],
  accountIds: string[],
  contents: string[],
): Promise<number> {
  const rows: Array<Record<string, any>> = [];
  let i = 0;
  for (const postId of postIds) {
    for (const accountId of accountIds) {
      const post = asUuid(postId);
      const user = asUuid(accountId);
      if (!post || !user) continue;
      rows.push({ post_id: post, user_id: user, content: contents[i % contents.length] });
      i += 1;
    }
  }
  if (!rows.length) return 0;

  const { error } = await s3().from("comments").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Trả lời bình luận (có `parent_id`) dưới danh nghĩa clone — Supabase #3. */
export async function replyCommentSb3(
  postId: string,
  accountId: string,
  content: string,
  parentId?: string | null,
): Promise<void> {
  const post = asUuid(postId);
  const user = asUuid(accountId);
  if (!post || !user) throw new Error("Bài viết hoặc tài khoản không hợp lệ");
  const payload: Record<string, any> = { post_id: post, user_id: user, content };
  const parent = asUuid(parentId);
  if (parent) payload.parent_id = parent;
  const { error } = await s3().from("comments").insert([payload]);
  if (error) throw new Error(error.message);
}

/** Đọc bình luận của một bài viết từ Supabase #3 (kèm tác giả từ #1). */
export async function fetchPostCommentsSb3(postId: string, limit = 200) {
  const post = asUuid(postId);
  if (!post) return [];
  const { data, error } = await s3()
    .from("comments")
    .select("id, post_id, user_id, content, created_at, parent_id")
    .eq("post_id", post)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  const profiles = await fetchProfilesLite(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const p = profiles.get(r.user_id);
    return {
      id: r.id as string,
      post_id: r.post_id as string,
      content: (r.content ?? "") as string,
      created_at: (r.created_at ?? null) as string | null,
      parent_id: (r.parent_id ?? null) as string | null,
      author_id: r.user_id as string,
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
