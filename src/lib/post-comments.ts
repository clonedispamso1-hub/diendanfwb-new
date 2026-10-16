/**
 * Bình luận + trả lời bình luận cho bài viết.
 * Dùng bảng `comments` CÓ SẴN trên Supabase #3 (cùng nơi lưu `posts`):
 *   id, post_id, user_id, parent_id, content, is_hidden, created_at
 * Không tạo bảng mới. Trigger s3_comments_counter tự cập nhật posts.comments_count.
 */
import { socialDb } from "@/services/database";
import { fetchProfilesByIds } from "@/lib/profile-cache";

export const COMMENT_MAX_LENGTH = 1000;

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string | null;
  created_at: string;
}

export interface CommentNode extends CommentRow {
  replies: CommentRow[];
}

/** Gom bình luận thành cây 2 cấp: gốc (cũ → mới) + trả lời (cũ → mới). */
export function buildCommentThreads(rows: CommentRow[]): CommentNode[] {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const byId = new Map(sorted.map((r) => [r.id, r]));
  const roots = new Map<string, CommentNode>();
  for (const r of sorted) if (!r.parent_id || !byId.has(r.parent_id)) roots.set(r.id, { ...r, replies: [] });
  for (const r of sorted) {
    if (roots.has(r.id)) continue;
    // Trả lời của trả lời → gắn về bình luận gốc trên cùng.
    let top = byId.get(r.parent_id!);
    const seen = new Set<string>();
    while (top && top.parent_id && byId.has(top.parent_id) && !seen.has(top.id)) {
      seen.add(top.id);
      top = byId.get(top.parent_id);
    }
    const root = top ? roots.get(top.id) : undefined;
    if (root) root.replies.push(r);
  }
  return [...roots.values()];
}

/** Kiểm tra nội dung trước khi gửi. Trả về thông báo lỗi hoặc null. */
export function validateComment(text: string): string | null {
  const t = text.trim();
  if (!t) return "Vui lòng nhập nội dung bình luận.";
  if (t.length > COMMENT_MAX_LENGTH) return `Bình luận tối đa ${COMMENT_MAX_LENGTH} ký tự.`;
  return null;
}

const COLS = "id, post_id, user_id, parent_id, content, created_at";

export async function listComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await (socialDb().from("comments") as any)
    .select(COLS)
    .eq("post_id", postId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as CommentRow[];
}

export async function addComment(input: {
  postId: string;
  userId: string;
  content: string;
  parentId?: string | null;
}): Promise<CommentRow> {
  const { data, error } = await (socialDb().from("comments") as any)
    .insert({
      post_id: input.postId,
      user_id: input.userId,
      parent_id: input.parentId ?? null,
      content: input.content.trim(),
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as CommentRow;
}

/** Ẩn bình luận (xoá mềm) — chỉ tác giả hoặc Admin được gọi từ UI. */
export async function hideComment(id: string): Promise<void> {
  const { error } = await (socialDb().from("comments") as any).update({ is_hidden: true }).eq("id", id);
  if (error) throw error;
}

export { fetchProfilesByIds };
