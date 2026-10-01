import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type HotBanner = { id: string; storage_path: string; image_url: string; active: boolean; created_at: string; updated_at: string };
export type HotCode = { id: string; title: string; content: string; code: string; expires_at: string | null; status: "draft" | "published"; created_at: string; updated_at: string };

async function admin(token: string) {
  const S = await import("@/lib/admin-purge.server");
  const F = await import("@/lib/flash-albums.server");
  const missing = S.missingServiceKeys(["sb1", "sb4"]);
  if (missing.length) throw new Error(`Thiếu khoá máy chủ: ${missing.join(", ")}`);
  const check = await S.verifyAdmin(token);
  if (!check.ok) throw new Error(check.reason);
  const sb = F.flashAdminClient();
  if (!sb) throw new Error("Không kết nối được kho dữ liệu HOT.");
  return sb;
}

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_V4_URL, SUPABASE_V4_ANON_KEY: key } = await import("@/lib/supabase-v4");
  return createClient<any>(SUPABASE_V4_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

export const hotPublicFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ banner: HotBanner | null; codes: HotCode[]; error: string | null }> => {
  const sb = await publicClient();
  const [bannerResult, codesResult] = await Promise.all([
    sb.from("flash_hot_banners").select("id,storage_path,image_url,active,created_at,updated_at").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("flash_hot_codes").select("id,title,content,code,expires_at,status,created_at,updated_at").eq("status", "published").order("created_at", { ascending: false }),
  ]);
  const failed = [["flash_hot_banners", bannerResult.error], ["flash_hot_codes", codesResult.error]] as const;
  const errs = failed.filter(([, e]) => e).map(([t, e]) => `${t}: [${e!.code}] ${e!.message}${e!.details ? ` | details: ${e!.details}` : ""}${e!.hint ? ` | hint: ${e!.hint}` : ""}`);
  if (errs.length) {
    console.error("[hotPublicFn]", errs.join(" || "));
    return { banner: null, codes: [], error: errs.join(" || ") };
  }
  return { banner: bannerResult.data as HotBanner | null, codes: (codesResult.data ?? []) as HotCode[], error: null };
});

const Auth = z.object({ token: z.string().min(10) });
export const hotAdminListFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }): Promise<{ banners: HotBanner[]; codes: HotCode[] }> => {
    const sb = await admin(data.token);
    const [b, c] = await Promise.all([
      sb.from("flash_hot_banners").select("*").order("created_at", { ascending: false }),
      sb.from("flash_hot_codes").select("*").order("created_at", { ascending: false }),
    ]);
    if (b.error || c.error) throw new Error(b.error?.message || c.error?.message);
    return { banners: (b.data ?? []) as HotBanner[], codes: (c.data ?? []) as HotCode[] };
  });

export const hotSignBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ ext: z.enum(["jpg", "jpeg", "png", "webp", "gif"]) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    const path = `hot-banners/${crypto.randomUUID()}.${data.ext}`;
    const { data: signed, error } = await sb.storage.from("flash-albums").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, uploadToken: signed.token };
  });

export const hotSaveBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ path: z.string().regex(/^hot-banners\/[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    const { data: file, error: lookupError } = await sb.storage.from("flash-albums").info(data.path);
    if (lookupError || !file) throw new Error("Ảnh banner chưa được tải lên.");
    const url = sb.storage.from("flash-albums").getPublicUrl(data.path).data.publicUrl;
    const { error: disableError } = await sb.from("flash_hot_banners").update({ active: false, updated_at: new Date().toISOString() }).eq("active", true);
    if (disableError) throw new Error(disableError.message);
    const { error } = await sb.from("flash_hot_banners").insert({ storage_path: data.path, image_url: url, active: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hotSetBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    if (data.active) {
      const { error } = await sb.from("flash_hot_banners").update({ active: false, updated_at: new Date().toISOString() }).eq("active", true);
      if (error) throw new Error(error.message);
    }
    const { error } = await sb.from("flash_hot_banners").update({ active: data.active, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hotDeleteBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    const { data: row, error: readError } = await sb.from("flash_hot_banners").select("storage_path").eq("id", data.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    const { error } = await sb.from("flash_hot_banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.storage_path?.startsWith("hot-banners/")) await sb.storage.from("flash-albums").remove([row.storage_path]);
    return { ok: true };
  });

export const hotSaveCodeFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(160), content: z.string().max(10000), code: z.string().trim().min(1).max(120), expires_at: z.string().datetime().nullable(), status: z.enum(["draft", "published"]) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    const { token: _token, id, ...fields } = data;
    const { error } = id
      ? await sb.from("flash_hot_codes").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
      : await sb.from("flash_hot_codes").insert(fields);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hotDeleteCodeFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.token);
    const { error } = await sb.from("flash_hot_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
const MEDIA_PREFIX = "__hot_media__:";
export type HotMedia = { image_url: string; video_url: string };
/** Ảnh/video lưu nguyên vẹn trong trường content cũ (không đổi schema). Code cũ dạng văn bản vẫn đọc bình thường. */
export function encodeHotMedia(m: HotMedia & { text?: string }) { return MEDIA_PREFIX + JSON.stringify(m); }
export function decodeHotMedia(content: string): HotMedia & { text: string } {
  if (content?.startsWith(MEDIA_PREFIX)) {
    try { const m = JSON.parse(content.slice(MEDIA_PREFIX.length)); return { image_url: String(m.image_url || ""), video_url: String(m.video_url || ""), text: String(m.text || "") }; } catch { /* fallthrough */ }
  }
  return { image_url: "", video_url: "", text: content || "" };
}
