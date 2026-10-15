import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseTemplates } from "./from-reply";

const Token = z.object({ token: z.string().min(10) });

export const fromReplyNotifyFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Token.extend({ receiverId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const S = await import("./from-reply.server");
    try { return await S.notifyPostMessage(data.token, data.receiverId); }
    catch (e) { console.error("[from-reply notify]", (e as Error).message); return { ok: false, result: "error" }; }
  });

export const fromReplyLoadFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Token.parse(d))
  .handler(async ({ data }) => {
    const S = await import("./from-reply.server");
    try { return { ok: true as const, data: await S.adminLoad(data.token) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export const fromReplySaveFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Token.extend({ replies1: z.string().max(50_000), replies2: z.string().max(50_000) }).parse(d))
  .handler(async ({ data }) => {
    const S = await import("./from-reply.server");
    try { await S.adminSave(data.token, parseTemplates(data.replies1), parseTemplates(data.replies2)); return { ok: true as const }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });
