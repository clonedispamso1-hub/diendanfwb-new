/**
 * RPC cấp phiên Supabase #3 cho user đang đăng nhập ở Supabase #1.
 * Toàn bộ logic + service role nằm trong `chat-session.server.ts` (server-only).
 */
import { createServerFn } from "@tanstack/react-start";

export const grantChatSessionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => {
    const token = typeof input?.accessToken === "string" ? input.accessToken.trim() : "";
    if (!token) throw new Error("accessToken required");
    return { accessToken: token };
  })
  .handler(async ({ data }) => {
    const { grantChatSession } = await import("./chat-session.server");
    return grantChatSession(data.accessToken);
  });
