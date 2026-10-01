/**
 * ⚡ ALBUM HOT — server functions. Mọi thao tác quản lý đều xác minh Admin
 * phía máy chủ (bangchu / profiles.is_admin trên Supabase #1) rồi mới ghi
 * vào Supabase #4 bằng service role.
 *
 * Hệ thống chính: flash_albums + flash_album_media (mỗi media 1 record).
 * Code HOT cũ trong flash_hot_codes được đồng bộ thành album (giữ nguyên Code),
 * bảng gốc không bị xóa.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type FlashMedia = {
  id: string;
  album_id: string;
  kind: "image" | "video";
  storage_path: string | null;
  url: string;
  size_bytes: number;
  display_order?: number | null;
  created_at: string;
};
export type FlashAlbum = {
  id: string;
  code: string;
  name: string;
  cover_media_id: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
  media: FlashMedia[];
  /** true = Code HOT cũ chưa đồng bộ, chỉ đọc. */
  legacy?: boolean;
};

const Tok = z.object({ token: z.string().min(10) });
const HttpUrl = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), "URL phải bắt đầu bằng http:// hoặc https://");

async function guard(token: string) {
  const S = await import("@/lib/admin-purge.server");
  const F = await import("@/lib/flash-albums.server");
  const missing = S.missingServiceKeys(["sb1", "sb4"]);
  if (missing.length) throw new Error(`Thiếu khoá máy chủ: ${missing.join(", ")}`);
  const admin = await S.verifyAdmin(token);
  if (!admin.ok) throw new Error(admin.reason);
  const sb = F.flashAdminClient()!;
  return { sb, F };
}

function sortMedia(list: any[]): FlashMedia[] {
  return [...(list ?? [])].sort((a, b) => {
    const ao = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

function mapAlbum(r: any): FlashAlbum {
  return {
    ...r,
    like_count: Number(r.like_count) || 0,
    view_count: Number(r.view_count) || 0,
    media: sortMedia(r.media ?? []),
  };
}

const MEDIA_PREFIX = "__hot_media__:";
function decodeLegacy(content: string): { image_url: string; video_url: string } {
  if (content?.startsWith(MEDIA_PREFIX)) {
    try {
      const m = JSON.parse(content.slice(MEDIA_PREFIX.length));
      return { image_url: String(m.image_url || ""), video_url: String(m.video_url || "") };
    } catch { /* ignore */ }
  }
  return { image_url: "", video_url: "" };
}

/**
 * Chèn media, chịu được DB chưa chạy migration:
 * - thiếu cột display_order → chèn lại không có cột đó
 * - storage_path còn NOT NULL → dùng chuỗi rỗng cho media URL
 */
async function insertMedia(sb: any, rows: any[]) {
  let payload = rows;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sb.from("flash_album_media").insert(payload).select("id, kind, storage_path");
    if (!res.error) return res.data as { id: string; kind: string; storage_path: string | null }[];
    const e = res.error;
    if (/display_order/i.test(e.message) && (e.code === "42703" || e.code === "PGRST204")) {
      payload = payload.map(({ display_order: _d, ...r }: any) => r);
      continue;
    }
    if (e.code === "23502" && /storage_path/i.test(e.message)) {
      payload = payload.map((r: any) => ({ ...r, storage_path: r.storage_path ?? "" }));
      continue;
    }
    throw new Error(e.message);
  }
  throw new Error("Không lưu được media.");
}

async function nextOrder(sb: any, albumId: string): Promise<number> {
  const { data, error } = await sb.from("flash_album_media").select("*").eq("album_id", albumId);
  if (error) return 0;
  const rows = data ?? [];
  const max = rows.reduce((m: number, r: any) => Math.max(m, Number(r.display_order ?? -1)), -1);
  return Math.max(max + 1, rows.length);
}

async function ensureCover(sb: any, albumId: string, inserted: { id: string; kind: string }[]) {
  const firstImg = inserted.find((r) => r.kind === "image");
  if (firstImg) await sb.from("flash_albums").update({ cover_media_id: firstImg.id }).eq("id", albumId).is("cover_media_id", null);
}

/** Đồng bộ Code HOT cũ (flash_hot_codes) thành album. Idempotent theo Code; không xóa dữ liệu gốc. */
async function syncLegacyHotCodes(sb: any) {
  const [{ data: hot }, { data: albums }] = await Promise.all([
    sb.from("flash_hot_codes").select("id,title,content,code,created_at"),
    sb.from("flash_albums").select("code"),
  ]);
  const have = new Set((albums ?? []).map((a: any) => String(a.code).toUpperCase()));
  for (const h of hot ?? []) {
    const code = String(h.code || "").trim().toUpperCase();
    if (!code || have.has(code)) continue;
    const { data: row, error } = await sb
      .from("flash_albums")
      .insert({ name: h.title || code, code, created_at: h.created_at })
      .select("id")
      .single();
    if (error || !row) {
      console.error("[flash] sync legacy code", code, error?.message);
      continue;
    }
    have.add(code);
    const m = decodeLegacy(h.content);
    const items = [
      m.image_url && { kind: "image", url: m.image_url },
      m.video_url && { kind: "video", url: m.video_url },
    ].filter(Boolean) as { kind: string; url: string }[];
    if (items.length) {
      const ins = await insertMedia(sb, items.map((it, i) => ({ album_id: row.id, kind: it.kind, url: it.url, storage_path: null, size_bytes: 0, display_order: i })));
      await ensureCover(sb, row.id, ins);
    }
  }
}

export const flashListFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.parse(d))
  .handler(async ({ data }): Promise<FlashAlbum[]> => {
    const { sb } = await guard(data.token);
    try { await syncLegacyHotCodes(sb); } catch (e) { console.error("[flash] sync", e); }
    const { data: rows, error } = await sb
      .from("flash_albums")
      .select("*, media:flash_album_media(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapAlbum);
  });

const NewMedia = z.object({
  kind: z.enum(["image", "video"]),
  url: HttpUrl.optional(),
  path: z.string().max(300).optional(),
  size: z.number().int().min(0).optional(),
});

/** Thêm media (URL bất kỳ domain hoặc file đã upload lên bucket) theo đúng thứ tự gửi lên. */
export const flashAddMediaFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ id: z.string().uuid(), items: z.array(NewMedia).min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    const start = await nextOrder(sb, data.id);
    const rows = data.items.map((it, i) => {
      if (it.path) {
        if (!it.path.startsWith(`${data.id}/`)) throw new Error("Đường dẫn tệp không hợp lệ.");
        return {
          album_id: data.id, kind: it.kind, storage_path: it.path, size_bytes: it.size ?? 0,
          url: sb.storage.from(F.FLASH_BUCKET).getPublicUrl(it.path).data.publicUrl, display_order: start + i,
        };
      }
      if (!it.url) throw new Error("Thiếu URL media.");
      return { album_id: data.id, kind: it.kind, storage_path: null, size_bytes: 0, url: it.url, display_order: start + i };
    });
    const ins = await insertMedia(sb, rows);
    await ensureCover(sb, data.id, ins);
    return { ok: true, count: ins.length };
  });

export const flashCreateFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    for (let i = 0; i < 8; i++) {
      const code = F.randomAlbumCode();
      const { data: row, error } = await sb.from("flash_albums").insert({ name: data.name, code }).select("id, code").single();
      if (!error) return row as { id: string; code: string };
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Không tạo được mã album, thử lại.");
  });

export const flashRenameFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { sb } = await guard(data.token);
    const { error } = await sb.from("flash_albums").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const flashDeleteFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    await F.removeFolder(sb, data.id);
    await sb.from("flash_album_media").delete().eq("album_id", data.id);
    const { error } = await sb.from("flash_albums").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const flashSetCoverFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ id: z.string().uuid(), mediaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { sb } = await guard(data.token);
    const { error } = await sb.from("flash_albums").update({ cover_media_id: data.mediaId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const FileSpec = z.object({ kind: z.enum(["image", "video"]), ext: z.string().regex(/^[a-z0-9]{1,5}$/) });

/** Cấp URL upload có chữ ký để trình duyệt tải thẳng lên bucket ⚡. */
export const flashSignUploadsFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ id: z.string().uuid(), files: z.array(FileSpec).min(1).max(50) }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    const out: { path: string; token: string }[] = [];
    for (const f of data.files) {
      const path = `${data.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${f.ext}`;
      const { data: s, error } = await sb.storage.from(F.FLASH_BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(error.message);
      out.push({ path, token: s.token });
    }
    return out;
  });

export const flashDeleteMediaFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ mediaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    const { data: m } = await sb.from("flash_album_media").select("storage_path, album_id").eq("id", data.mediaId).maybeSingle();
    if (!m) return { ok: true };
    if (m.storage_path) await sb.storage.from(F.FLASH_BUCKET).remove([m.storage_path]);
    await sb.from("flash_albums").update({ cover_media_id: null }).eq("cover_media_id", data.mediaId);
    const { error } = await sb.from("flash_album_media").delete().eq("id", data.mediaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Xóa tất cả — CHỈ bảng flash_albums/flash_album_media và bucket `flash-albums`. */
export const flashPurgeAllFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Tok.extend({ confirm: z.literal("XOA") }).parse(d))
  .handler(async ({ data }) => {
    const { sb, F } = await guard(data.token);
    const { data: albums } = await sb.from("flash_albums").select("id");
    let files = 0;
    for (const a of albums ?? []) files += await F.removeFolder(sb, (a as any).id);
    const { error } = await sb.from("flash_albums").delete().not("id", "is", null);
    if (error) throw new Error(error.message);
    return { albums: albums?.length ?? 0, files };
  });

/* ---------------- CÔNG KHAI — danh sách Album HOT ---------------- */
async function publicSb4() {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_V4_URL, SUPABASE_V4_ANON_KEY: key } = await import("@/lib/supabase-v4");
  return createClient<any>(SUPABASE_V4_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Nội bộ máy chủ: toàn bộ Album HOT (flash_albums + Code HOT cũ chưa đồng bộ). KHÔNG trả thẳng cho client. */
async function loadPublicAlbums(): Promise<{ albums: FlashAlbum[]; error: string | null }> {
    const sb = await publicSb4();
    const load = () => Promise.all([
      sb.from("flash_albums").select("*, media:flash_album_media(*)").order("created_at", { ascending: false }),
      sb.from("flash_hot_codes").select("id,title,content,code,status,created_at").eq("status", "published"),
    ]);
    let [a, h] = await load();
    if (a.error) {
      console.error("[flashPublicListFn]", a.error.message);
      return { albums: [], error: "Không tải được Album HOT." };
    }
    // Tự chuyển Code HOT cũ thành Album trên máy chủ (không cần Admin mở trang). Idempotent theo Code.
    const existing = new Set((a.data ?? []).map((x: any) => String(x.code).toUpperCase()));
    const pending = (h.data ?? []).some((r: any) => r.code && !existing.has(String(r.code).trim().toUpperCase()));
    if (pending) {
      const { flashAdminClient } = await import("./flash-albums.server");
      const adm = flashAdminClient();
      if (adm) {
        try {
          await syncLegacyHotCodes(adm);
          const again = await load();
          if (!again[0].error) [a, h] = again;
        } catch (e) { console.error("[flash] public sync", e); }
      }
    }
    const albums = (a.data ?? []).map(mapAlbum);
    const have = new Set(albums.map((x) => x.code.toUpperCase()));
    for (const r of h.data ?? []) {
      const code = String(r.code || "").trim().toUpperCase();
      if (!code || have.has(code)) continue;
      const m = decodeLegacy(r.content);
      const media: FlashMedia[] = [];
      if (m.image_url) media.push({ id: `${r.id}-img`, album_id: r.id, kind: "image", storage_path: null, url: m.image_url, size_bytes: 0, display_order: 0, created_at: r.created_at });
      if (m.video_url) media.push({ id: `${r.id}-vid`, album_id: r.id, kind: "video", storage_path: null, url: m.video_url, size_bytes: 0, display_order: 1, created_at: r.created_at });
      albums.push({ id: r.id, code, name: r.title || code, cover_media_id: null, like_count: 0, view_count: 0, created_at: r.created_at, media, legacy: true });
    }
    albums.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    return { albums, error: null };
}

/** Thẻ khóa công khai: CHỈ có id — không tên, không code, không media. */
export type FlashLockedCard = { id: string };

/** Danh sách công khai: chỉ trả id để render thẻ khóa. */
export const flashPublicListFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ albums: FlashLockedCard[]; error: string | null }> => {
    const r = await loadPublicAlbums();
    return { albums: r.albums.map((a) => ({ id: a.id })), error: r.error };
  },
);

function normalizeCode(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9]{3}$/.test(compact) ? `${compact.slice(0, 3)}-${compact.slice(3)}` : raw.trim().toUpperCase();
}

/** Xác thực code trên máy chủ. Chỉ khi đúng mới trả nội dung album. `id` bỏ trống = tìm theo code. */
export const flashUnlockFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().min(1).max(100).optional(), code: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; album: FlashAlbum } | { ok: false }> => {
    const code = normalizeCode(data.code);
    const { albums } = await loadPublicAlbums();
    const album = albums.find((a) => a.code.toUpperCase() === code && (!data.id || a.id === data.id));
    return album ? { ok: true, album } : { ok: false };
  });

export const flashViewFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await publicSb4();
    const { data: n } = await sb.rpc("flash_album_view", { _album_id: data.id });
    return { view_count: Number(n) || 0 };
  });
