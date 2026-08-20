/**
 * Unified GIF / sticker library for Posts, Comments and Private Messages.
 *
 * The default pack ("Gif cute hột lke") can be replaced/extended at any time:
 *  - drop items into `DEFAULT_PACK` below, or
 *  - upload from the picker (stored locally per-device via `addCustomGif`).
 *
 * No database logic is involved — items are plain media URLs.
 */

export type GifKind = "gif" | "sticker" | "icon";

export interface GifItem {
  id: string;
  url: string;
  /** gif = animated GIF, sticker = animated/static sticker, icon = small animated icon */
  kind: GifKind;
  label: string;
  keywords?: string[];
  /** Quyền sử dụng: public | vip | admin (mặc định public). */
  accessLevel?: import("@/lib/media-library").AccessLevel;
  /** Tên thư mục (nếu có). */
  folderName?: string | null;
}

const g = (id: string, url: string, kind: GifKind, label: string, keywords: string[] = []): GifItem => ({
  id,
  url,
  kind,
  label,
  keywords: [label, ...keywords],
});

/** Default library — replaced by the uploaded "Gif cute hột lke" pack. */
export const DEFAULT_PACK: GifItem[] = [
  g("cute-love", "https://media.giphy.com/media/l0HlQXkh1wx1RjtUA/giphy.gif", "gif", "Yêu thương", ["love", "tim", "heart"]),
  g("cute-hi", "https://media.giphy.com/media/3ornka9rAaKRA2Rkac/giphy.gif", "gif", "Chào", ["hi", "hello", "vẫy tay"]),
  g("cute-lol", "https://media.giphy.com/media/O5NyCibf93upy/giphy.gif", "gif", "Cười", ["lol", "haha", "funny"]),
  g("cute-cry", "https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif", "gif", "Khóc", ["cry", "buồn", "sad"]),
  g("cute-ok", "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif", "gif", "OK", ["ok", "đồng ý"]),
  g("cute-dance", "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", "gif", "Nhảy", ["dance", "vui"]),
  g("cute-thanks", "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", "gif", "Cảm ơn", ["thanks", "ty"]),
  g("cute-sleepy", "https://media.giphy.com/media/aNqEFrYVnsS52/giphy.gif", "gif", "Buồn ngủ", ["sleep", "ngủ"]),

  g("st-cat-hi", "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif", "sticker", "Mèo chào", ["cat", "mèo"]),
  g("st-dog-happy", "https://media.giphy.com/media/mCRJDo24UvJMA/giphy.gif", "sticker", "Cún vui", ["dog", "cún"]),
  g("st-hug", "https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif", "sticker", "Ôm", ["hug", "ôm"]),
  g("st-kiss", "https://media.giphy.com/media/ZBQhoZC0nqknSviPqT/giphy.gif", "sticker", "Hôn", ["kiss", "hôn"]),
  g("st-shy", "https://media.giphy.com/media/QWvra259h4LCvdJnxP/giphy.gif", "sticker", "Ngại", ["shy", "thẹn"]),
  g("st-angry", "https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif", "sticker", "Giận", ["angry", "giận"]),

  g("ic-like", "https://media.giphy.com/media/QWvra259h4LCvdJnxP/giphy.gif", "icon", "Like", ["like", "thích"]),
  g("ic-fire", "https://media.giphy.com/media/l0HlOBZcl7sbV6LnO/giphy.gif", "icon", "Lửa", ["fire", "hot"]),
  g("ic-heart", "https://media.giphy.com/media/RlqidJHbeL1sc/giphy.gif", "icon", "Tim", ["heart", "tim"]),
  g("ic-star", "https://media.giphy.com/media/gjrYCbTlgqhrIhwZ0z/giphy.gif", "icon", "Sao", ["star", "sao"]),
];

const CUSTOM_KEY = "fwbvn.gifpack.custom.v1";

export function getCustomGifs(): GifItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GifItem[]) : [];
  } catch {
    return [];
  }
}

export function addCustomGif(item: GifItem): GifItem[] {
  const next = [item, ...getCustomGifs().filter((i) => i.url !== item.url)].slice(0, 60);
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function getLibrary(): GifItem[] {
  return [...getCustomGifs(), ...DEFAULT_PACK];
}

/* ---------------------- DB-backed shared library ----------------------- */
/**
 * Persistent library shared across all users, stored in `public.gif_library`.
 * Falls back gracefully to the local defaults when the table does not exist
 * or the fetch fails (e.g. offline).
 */
import { supabase } from "@/lib/supabase";
import { isSchemaError, markLegacySchema, type AccessLevel } from "@/lib/media-library";

let sharedCache: GifItem[] | null = null;

export async function fetchSharedLibrary(force = false): Promise<GifItem[]> {
  if (!force && sharedCache) return sharedCache;
  try {
    const run = (withAccess: boolean) => {
      let q = supabase
        .from("gif_library" as any)
        .select("id, url, kind, label, keywords").limit(100);
      // Thư viện dùng chung ngoài trang chủ: CHỈ item công khai.
      if (withAccess) q = q.eq("access_level", "public");
      return q.order("created_at", { ascending: false }).limit(500);
    };
    let { data, error } = await run(true);
    if (error && isSchemaError(error)) {
      markLegacySchema();
      ({ data, error } = await run(false));
    }
    if (error) throw error;
    const rows = (data ?? []) as any[];
    sharedCache = rows.map((r) => ({
      id: String(r.id),
      url: String(r.url),
      kind: (r.kind as GifKind) ?? "gif",
      label: String(r.label ?? ""),
      keywords: Array.isArray(r.keywords) ? r.keywords : [],
    }));
  } catch {
    sharedCache = [];
  }
  return sharedCache!;
}

export interface AddSharedGifResult {
  ok: boolean;
  item?: GifItem;
  error?: string;
}

export async function addSharedGif(input: Omit<GifItem, "id">): Promise<AddSharedGifResult> {
  try {
    const { data, error } = await supabase
      .from("gif_library" as any)
      .insert({
        url: input.url,
        kind: input.kind,
        label: input.label,
        keywords: input.keywords ?? [],
      })
      .select("id, url, kind, label, keywords")
      .single();
    if (error || !data) {
      const msg = error?.message || "insert returned empty";
      console.error("[gif_library] insert failed:", error);
      return { ok: false, error: msg };
    }
    const row = data as any;
    const item: GifItem = {
      id: String(row.id),
      url: String(row.url),
      kind: row.kind as GifKind,
      label: String(row.label ?? ""),
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
    };
    sharedCache = [item, ...(sharedCache ?? [])];
    return { ok: true, item };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gif_library] insert threw:", err);
    return { ok: false, error: msg };
  }
}

export function invalidateSharedLibrary() {
  sharedCache = null;
}

/* --------------------------- Paged DB fetching -------------------------- */

export interface GifPage {
  items: GifItem[];
  total: number;
}

const mapRow = (r: any): GifItem => ({
  id: String(r.id),
  url: String(r.url),
  kind: (r.kind as GifKind) ?? "gif",
  label: String(r.label ?? ""),
  keywords: Array.isArray(r.keywords) ? r.keywords : [],
  accessLevel: (r.access_level as AccessLevel) ?? "public",
  folderName: r.folder_name ?? null,
});

/**
 * Server-side pagination (LIMIT + OFFSET) so the picker never loads the
 * whole library. Falls back to the bundled default pack when the shared
 * table has no rows for that kind (or is unreachable).
 */
export async function fetchGifPage(
  kind: GifKind,
  page: number,
  pageSize: number,
  query = "",
  opts: { levels?: AccessLevel[]; folder?: string | null } = {},
): Promise<GifPage> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const levels = opts.levels ?? ["public"];

  const run = async (withAccess: boolean) => {
    let q = supabase
      .from("gif_library" as any)
      .select(
        withAccess
          ? "id, url, kind, label, keywords, folder_name, access_level"
          : "id, url, kind, label, keywords",
        { count: "exact" },
      )
      .eq("kind", kind);
    if (withAccess) {
      q = q.in("access_level", levels);
      if (opts.folder) q = q.eq("folder_name", opts.folder);
    }
    const term = query.trim();
    if (term) q = q.ilike("label", `%${term}%`);
    return q.order("created_at", { ascending: false }).range(from, to);
  };

  try {
    let { data, error, count } = await run(true);
    if (error && isSchemaError(error)) {
      markLegacySchema();
      ({ data, error, count } = await run(false));
    }
    if (error) throw error;
    const total = count ?? 0;
    if (total > 0) return { items: (data ?? []).map(mapRow), total };
    // Có bảng nhưng không có item hợp lệ cho quyền hiện tại → không fallback
    // sang pack mặc định nếu người dùng đang lọc theo thư mục / tìm kiếm.
    if (query.trim() || opts.folder) return { items: [], total: 0 };
  } catch {
    /* fall through to local pack */
  }
  const local = searchLibrary(
    [...getCustomGifs(), ...DEFAULT_PACK].filter((i) => i.kind === kind),
    query,
  );
  return { items: local.slice(from, from + pageSize), total: local.length };
}

/* ------------------------------ Recent GIFs ----------------------------- */

const RECENT_KEY = "fwbvn.gifpack.recent.v1";
const RECENT_MAX = 30;

export function getRecentGifs(): GifItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as GifItem[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentGif(item: GifItem): GifItem[] {
  const next = [item, ...getRecentGifs().filter((i) => i.url !== item.url)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function searchLibrary(items: GifItem[], q: string): GifItem[] {
  const query = q.trim().toLowerCase();
  if (!query) return items;
  return items.filter((i) =>
    (i.keywords ?? [i.label]).some((k) => k.toLowerCase().includes(query)),
  );
}

/** Classify an uploaded media file into a picker kind. */
export function classifyMedia(file: File): "gif" | "animated-sticker" | "video" | "image" | "unsupported" {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (type === "image/webp" || name.endsWith(".webp") || name.endsWith(".lottie") || name.endsWith(".json"))
    return "animated-sticker";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  return "unsupported";
}
