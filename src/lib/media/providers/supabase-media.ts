/**
 * Supabase Media provider — Supabase Project #2 (CHỈ dùng cho Storage).
 *
 * • KHÔNG đụng tới Supabase #1 (Auth / Database / RPC / Realtime).
 * • Client chỉ dùng Project URL + Anon Key (VITE_*). Service Role Key
 *   TUYỆT ĐỐI không được đưa vào frontend.
 * • Sau khi upload → lấy Public URL → caller lưu URL vào DB của Supabase #1.
 *
 * DÙNG CHUNG 1 bucket public duy nhất: `media`, chia theo subfolder:
 *   media/avatars | media/posts | media/comments | media/chat | media/stories
 *   media/gifs | media/stickers | media/audio | media/covers
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MediaKind, MediaProvider, ResourceType, UploadedMedia } from "../types";

/** Bucket public DUY NHẤT — mọi loại media nằm trong subfolder của bucket này. */
export const MEDIA_BUCKET = "media" as const;

export const MEDIA_FOLDERS = [
  "avatars",
  "posts",
  "comments",
  "chat",
  "stories",
  "gifs",
  "stickers",
  "audio",
  "covers",
] as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

const env = import.meta.env as Record<string, string | undefined>;

const MEDIA_URL = (env['VITE_MEDIA_SUPABASE_URL'] ?? "").replace(/\/+$/, "");
const MEDIA_ANON_KEY = env['VITE_MEDIA_SUPABASE_ANON_KEY'] ?? "";

const FOLDER_BY_KIND: Record<MediaKind, MediaFolder> = {
  avatar: "avatars",
  banner: "covers",
  gallery: "posts",
  post: "posts",
  video: "posts",
  comment: "comments",
  chat: "chat",
  story: "stories",
  featured: "stories",
  title: "gifs",
  verification: "posts",
  other: "posts",
};

/** Subfolder cuối cùng: ưu tiên loại file (gif / sticker / audio) rồi tới `kind`. */
export function resolveFolder(kind: MediaKind, file: File | Blob, filename: string): MediaFolder {
  const type = (file.type || "").toLowerCase();
  const name = filename.toLowerCase();
  if (type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|webm|aac|opus)$/.test(name)) return "audio";
  if (type === "image/gif" || name.endsWith(".gif")) return "gifs";
  if (type === "image/webp" && /sticker/.test(name)) return "stickers";
  if (kind === "title" && /sticker/.test(name)) return "stickers";
  return FOLDER_BY_KIND[kind] ?? "posts";
}

function detectResourceType(file: File | Blob): ResourceType {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  return "raw";
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function assertAllowed(file: File | Blob, filename: string) {
  if (/\.(exe|sh|bat|cmd|js|jar|apk|msi|php|py|dll|scr)$/i.test(filename)) {
    throw new Error("Định dạng tệp không được phép.");
  }
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video vượt quá 100MB.");
    return;
  }
  if (t.startsWith("audio/")) {
    if (file.size > MAX_AUDIO_BYTES) throw new Error("Audio vượt quá 30MB.");
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Tệp vượt quá 15MB.");
}

function safeExt(filename: string, file: File | Blob): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(filename);
  if (m) return m[1]!.toLowerCase();
  const t = (file.type || "").toLowerCase();
  if (t === "image/jpeg") return "jpg";
  if (t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/")) {
    return t.split("/")[1]!.split(";")[0]!;
  }
  return "bin";
}

let cached: SupabaseClient | null = null;
function mediaClient(): SupabaseClient {
  if (!MEDIA_URL || !MEDIA_ANON_KEY) {
    throw new Error(
      "Media Storage (Supabase #2) chưa được cấu hình. Thiếu VITE_MEDIA_SUPABASE_URL / VITE_MEDIA_SUPABASE_ANON_KEY.",
    );
  }
  if (!cached) {
    cached = createClient(MEDIA_URL, MEDIA_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  }
  return cached;
}

export interface SupabaseMediaConfig {
  name?: string;
}

export function createSupabaseMediaProvider(cfg: SupabaseMediaConfig = {}): MediaProvider {
  const name = cfg.name ?? "supabase-media";

  return {
    name,

    isEnabled() {
      return Boolean(MEDIA_URL && MEDIA_ANON_KEY);
    },

    ownsUrl(url) {
      return Boolean(MEDIA_URL) && url.startsWith(`${MEDIA_URL}/storage/v1/object/public/`);
    },

    async upload(file, filename, opts) {
      assertAllowed(file, filename);
      const folder = resolveFolder(opts.kind, file, filename);
      const ext = safeExt(filename, file);
      // QUAN TRỌNG: key KHÔNG chứa tiền tố "media/" — bucket đã là `media`.
      const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

      const debug = {
        projectUrl: MEDIA_URL,
        bucket: MEDIA_BUCKET,
        key,
        firstFolder: key.split("/")[0],
        kind: opts.kind,
        contentType: file.type || "application/octet-stream",
        bytes: file.size,
        endpoint: `${MEDIA_URL}/storage/v1/object/${MEDIA_BUCKET}/${key}`,
      };
      console.info("[MediaService][supabase-media] upload →", debug);

      opts.onProgress?.(10);
      const client = mediaClient();
      const { data: uploaded, error } = await client.storage.from(MEDIA_BUCKET).upload(key, file, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) {
        const raw = error as unknown as Record<string, unknown>;
        console.error("[MediaService][supabase-media] upload FAILED", {
          ...debug,
          errorName: error.name,
          errorMessage: error.message,
          statusCode: raw['statusCode'] ?? raw['status'],
          errorCode: raw['code'],
          raw,
        });
        throw new Error(`Upload thất bại (${MEDIA_BUCKET}/${folder}): ${error.message}`);
      }
      console.info("[MediaService][supabase-media] upload OK", { ...debug, path: uploaded?.path });
      opts.onProgress?.(100);

      const { data } = client.storage.from(MEDIA_BUCKET).getPublicUrl(key);
      const secureUrl = data.publicUrl;
      if (!secureUrl) throw new Error("Không lấy được Public URL của tệp vừa tải lên.");

      return {
        provider: name,
        publicId: `${MEDIA_BUCKET}/${key}`,
        secureUrl,
        resourceType: detectResourceType(file),
        bytes: file.size ?? 0,
        createdAt: new Date().toISOString(),
      } satisfies UploadedMedia;
    },

    buildUrl(url) {
      return url;
    },

    buildThumb(url, width) {
      // Supabase image transformation (render endpoint) — fallback về URL gốc.
      if (!url.includes("/storage/v1/object/public/")) return url;
      if (/\.gif($|\?)/i.test(url)) return url;
      const rendered = url.replace("/object/public/", "/render/image/public/");
      return `${rendered}?width=${Math.round(width)}&resize=contain&quality=80`;
    },
  };
}
