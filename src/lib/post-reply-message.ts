/** Post attachment metadata inside the existing private-message content field. */
export interface PostReplyContext {
  postId: string;
  authorId: string;
  authorName: string;
  preview: string;
  post?: {
    content: string;
    avatar: string | null;
    createdAt: string | null;
    media: string[];
    likes: number | null;
  };
}

const PREFIX = /^\[\[postreply:([^\]\n]+)\]\]\n/;

export function encodePostReply(context: PostReplyContext, message: string): string {
  return `[[postreply:${encodeURIComponent(JSON.stringify(context))}]]\n${message}`;
}

export function parsePostReply(content: string | null | undefined): { context: PostReplyContext; message: string } | null {
  const value = content ?? "";
  const match = PREFIX.exec(value);
  if (!match) return null;
  try {
    const data = JSON.parse(decodeURIComponent(match[1])) as Partial<PostReplyContext>;
    if (typeof data.postId !== "string" || typeof data.authorId !== "string" ||
        typeof data.authorName !== "string" || typeof data.preview !== "string") return null;
    const post = data.post;
    const validPost = post && typeof post === "object" && typeof post.content === "string" &&
      (post.avatar === null || typeof post.avatar === "string") &&
      (post.createdAt === null || typeof post.createdAt === "string") &&
      Array.isArray(post.media) && post.media.every((url) => typeof url === "string") &&
      (post.likes === null || typeof post.likes === "number") ? post : undefined;
    return { context: { postId: data.postId, authorId: data.authorId, authorName: data.authorName, preview: data.preview, post: validPost }, message: value.slice(match[0].length) };
  } catch { return null; }
}

export function postReplyText(content: string | null | undefined): string {
  return parsePostReply(content)?.message ?? content ?? "";
}