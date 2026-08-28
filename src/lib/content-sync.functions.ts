/**
 * Write-through nhỏ gọn: sau khi GHI thành công ở Supabase #1, đẩy ngay
 * bản ghi đó sang Supabase #3 để phần ĐỌC (đang lấy từ #3) không bị trễ.
 *
 * Không thay thế cron `/api/public/sync-content-to-s3` — cron là lưới an toàn.
 * Server function này chỉ dùng service key ở server, client không thấy key.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  table: z.enum(["posts", "comments", "likes", "follows"]),
  /** id bản ghi (hoặc cặp follower/following cho bảng follows). */
  id: z.string().uuid().optional(),
  follower_id: z.string().uuid().optional(),
  following_id: z.string().uuid().optional(),
  post_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  op: z.enum(["upsert", "delete"]).default("upsert"),
});

export const pushContentRow = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const k1 = process.env["SUPABASE1_SERVICE_ROLE_KEY"];
    const k3 = process.env["SUPABASE3_SERVICE_ROLE_KEY"];
    if (!k1 || !k3) return { ok: false as const, error: "missing keys" };

    const S1 = "https://gxfxqbhxoghdhokwjpex.supabase.co";
    const S3 = "https://uaqsetfdciyzxpuhulux.supabase.co";
    const h = (k: string, extra: Record<string, string> = {}) => ({
      apikey: k,
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      ...extra,
    });

    const match =
      data.table === "follows" && data.follower_id && data.following_id
        ? `follower_id=eq.${data.follower_id}&following_id=eq.${data.following_id}`
        : data.table === "likes" && data.post_id && data.user_id
          ? `post_id=eq.${data.post_id}&user_id=eq.${data.user_id}`
        : data.id
          ? `id=eq.${data.id}`
          : null;
    if (!match) return { ok: false as const, error: "missing identifier" };
    const conflict =
      data.table === "follows"
        ? "follower_id,following_id"
        : data.table === "likes"
          ? "post_id,user_id"
          : "id";

    if (data.op === "delete") {
      const res = await fetch(`${S3}/rest/v1/${data.table}?${match}`, {
        method: "DELETE",
        headers: h(k3, { Prefer: "return=minimal" }),
      });
      return { ok: res.ok, status: res.status };
    }

    const read = await fetch(`${S1}/rest/v1/${data.table}?select=*&${match}&limit=1`, {
      headers: h(k1),
    });
    if (!read.ok) return { ok: false as const, error: `read ${read.status}` };
    const rows = (await read.json()) as Record<string, unknown>[];
    if (!rows.length) return { ok: true as const, skipped: true };
    const row =
      data.table === "follows"
        ? {
            follower_id: rows[0]["follower_id"],
            following_id: rows[0]["following_id"],
            created_at: rows[0]["created_at"],
          }
        : rows[0];
    const res = await fetch(`${S3}/rest/v1/${data.table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: h(k3, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([row]),
    });
    return { ok: res.ok, status: res.status };
  });

const PostInput = z.object({ post_id: z.string().uuid() });

/** Đẩy toàn bộ bình luận của 1 bài + chính bài đó sang #3 (dùng sau khi thêm bình luận). */
export const pushPostComments = createServerFn({ method: "POST" })
  .inputValidator((d) => PostInput.parse(d))
  .handler(async ({ data }) => {
    const k1 = process.env["SUPABASE1_SERVICE_ROLE_KEY"];
    const k3 = process.env["SUPABASE3_SERVICE_ROLE_KEY"];
    if (!k1 || !k3) return { ok: false as const, error: "missing keys" };
    const S1 = "https://gxfxqbhxoghdhokwjpex.supabase.co";
    const S3 = "https://uaqsetfdciyzxpuhulux.supabase.co";
    const h = (k: string, extra: Record<string, string> = {}) => ({
      apikey: k,
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      ...extra,
    });
    const push = async (table: "comments" | "posts", query: string) => {
      const read = await fetch(`${S1}/rest/v1/${table}?${query}`, { headers: h(k1) });
      if (!read.ok) return;
      const rows = (await read.json()) as unknown[];
      if (!rows.length) return;
      await fetch(`${S3}/rest/v1/${table}?on_conflict=id`, {
        method: "POST",
        headers: h(k3, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
      });
    };
    await push("comments", `select=*&post_id=eq.${data.post_id}&order=created_at.desc&limit=200`);
    await push("posts", `select=*&id=eq.${data.post_id}&limit=1`);
    return { ok: true as const };
  });
