/**
 * RPC gắn link Facebook / Zalo vào bài viết.
 * Toàn bộ logic kiểm tra quyền + service role nằm trong
 * `post-contact-links.server.ts` (server-only).
 */
import { createServerFn } from "@tanstack/react-start";

export const attachPostContactLinksFn = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    postId: string;
    facebookUrl?: string | null;
    zaloUrl?: string | null;
  }) => {
    const accessToken = typeof input?.accessToken === "string" ? input.accessToken.trim() : "";
    const postId = typeof input?.postId === "string" ? input.postId.trim() : "";
    if (!accessToken) throw new Error("accessToken required");
    if (!postId) throw new Error("postId required");
    return {
      accessToken,
      postId,
      facebookUrl: input?.facebookUrl ? String(input.facebookUrl).slice(0, 500) : null,
      zaloUrl: input?.zaloUrl ? String(input.zaloUrl).slice(0, 500) : null,
    };
  })
  .handler(async ({ data }) => {
    const { attachPostContactLinks } = await import("./post-contact-links.server");
    return attachPostContactLinks(data);
  });
