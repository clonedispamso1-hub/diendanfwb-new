/**
 * Comments service.
 *
 * TODO(supabase): map to `public.comments` with RLS scoped by post visibility.
 */
import type { Comment, ServiceResult, UUID } from "./types";
import { delay, nowIso, uid } from "./_mock";

const mockComments: Comment[] = [];

export const commentsService = {
  async listByPost(postId: UUID): Promise<Comment[]> {
    await delay();
    return mockComments.filter((c) => c.post_id === postId);
  },

  async hide(id: UUID): Promise<ServiceResult> {
    await delay();
    const c = mockComments.find((c) => c.id === id);
    if (c) c.is_hidden = true;
    return { ok: true };
  },

  async remove(id: UUID): Promise<ServiceResult> {
    await delay();
    const i = mockComments.findIndex((c) => c.id === id);
    if (i >= 0) mockComments.splice(i, 1);
    return { ok: true };
  },

  async create(
    input: Pick<Comment, "post_id" | "author_id" | "content">,
  ): Promise<ServiceResult<Comment>> {
    await delay();
    const comment: Comment = {
      id: uid(),
      is_hidden: false,
      created_at: nowIso(),
      ...input,
    };
    mockComments.push(comment);
    return { ok: true, data: comment };
  },
};
