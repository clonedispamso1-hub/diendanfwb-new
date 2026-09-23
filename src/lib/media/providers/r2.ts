/**
 * Cloudflare R2 media provider (presigned PUT).
 *
 * Bảo mật:
 *   • Access Key / Secret CHỈ nằm ở server (env `R2_*`).
 *   • Client xin URL ký sẵn ở `/api/public/r2-sign` (yêu cầu đăng nhập),
 *     rồi PUT thẳng file lên R2 → không đi qua server, không tốn băng thông.
 *   • URL public trả về dạng `https://pub-xxxx.r2.dev/<folder>/<file>`.
 */

import type { MediaProvider, ResourceType, UploadedMedia } from "../types";
import { supabase } from "@/lib/supabase";
import { getR2SessionConfig } from "../r2-session-config";

/** Domain public mặc định của bucket R2 (an toàn để lộ — chỉ đọc). */
export const R2_PUBLIC_DOMAIN = "https://pub-877370bd26ca441294f1b74567432e8a.r2.dev";

const R2_URL_RE = /^https?:\/\/(pub-[a-z0-9]+\.r2\.dev|[a-z0-9.-]+\.r2\.cloudflarestorage\.com)\//i;

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/apng",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|oga|opus|aac|weba|flac|amr)$/i;
const isAudioFile = (file: File | Blob, filename: string) =>
  (file.type || "").toLowerCase().startsWith("audio/") || AUDIO_EXT_RE.test(filename);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export interface R2ProviderConfig {
  name?: string;
  signEndpoint?: string;
  enabled?: boolean;
}

function detectResourceType(file: File | Blob, filename = ""): ResourceType {
  const t = (file.type || "").toLowerCase();
  if (isAudioFile(file, filename)) return "video";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  if (/\.(mp4|webm|mov|mkv)$/i.test(filename)) return "video";
  if (/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(filename)) return "image";
  return "raw";
}

function assertAllowed(file: File | Blob, filename: string) {
  if (/\.(exe|sh|bat|cmd|jar|apk|msi|php|py|dll|scr)$/i.test(filename)) {
    throw new Error("Định dạng tệp không được phép.");
  }
  const type = (file.type || "").toLowerCase();
  if (ALLOWED_IMAGE.has(type) || /\.(jpe?g|png|webp|gif|avif|svg|apng)$/i.test(filename)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Ảnh vượt quá 15MB.");
    return;
  }
  if (ALLOWED_VIDEO.has(type) || /\.(mp4|webm|mov|mkv)$/i.test(filename)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video vượt quá 200MB.");
    return;
  }
  if (isAudioFile(file, filename)) {
    if (file.size > MAX_AUDIO_BYTES) throw new Error("Audio vượt quá 30MB.");
    return;
  }
  throw new Error(
    "Chỉ hỗ trợ ảnh (jpg, png, webp, gif), video (mp4, webm, mov) hoặc audio (mp3, wav, m4a, ogg).",
  );
}

function guessContentType(file: File | Blob, filename: string): string {
  if (file.type) return file.type;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return map[ext] || "application/octet-stream";
}

export function createR2Provider(config: R2ProviderConfig = {}): MediaProvider {
  const name = config.name ?? "cloudflare-r2";
  const signEndpoint = config.signEndpoint ?? "/api/public/r2-sign";

  return {
    name,

    isEnabled() {
      return config.enabled !== false;
    },

    ownsUrl(url) {
      return R2_URL_RE.test(url);
    },

    async upload(file, filename, opts): Promise<UploadedMedia> {
      assertAllowed(file, filename);
      const resourceType = detectResourceType(file, filename);
      const folder = String(opts.folder || "candy").replace(/^\/+|\/+$/g, "");
      const contentType = guessContentType(file, filename);

      let accessToken: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      } catch {
        /* ignore */
      }
      if (!accessToken) throw new Error("Cần đăng nhập để tải media lên.");

      const signRes = await fetch(signEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          folder,
          filename,
          contentType,
          // Cấu hình tạm do admin nhập trong phiên test (nếu có) — chỉ nằm
          // trong RAM tab hiện tại, gửi kèm request để ký bằng key đó.
          override: getR2SessionConfig() ?? undefined,
        }),
        signal: opts.signal,
      });
      if (!signRes.ok) {
        let detail = "";
        try {
          const err = (await signRes.json()) as { error?: string; detail?: string };
          detail = err?.detail || err?.error || "";
        } catch {
          /* ignore */
        }
        throw new Error(
          `Không lấy được chữ ký tải lên R2 (${signRes.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const sign = (await signRes.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
        contentType: string;
      };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sign.uploadUrl);
        xhr.setRequestHeader("content-type", sign.contentType || contentType);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && opts.onProgress) {
            opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            console.error("[r2-upload] response", { status: xhr.status, body: xhr.responseText });
            reject(new Error(`Tải lên R2 thất bại (${xhr.status}).`));
          }
        };
        xhr.onerror = () =>
          reject(new Error("R2: lỗi mạng hoặc bucket chưa bật CORS cho tên miền này."));
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        if (opts.signal) {
          if (opts.signal.aborted) xhr.abort();
          else opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.send(file);
      });

      opts.onProgress?.(100);

      return {
        provider: name,
        publicId: sign.key,
        secureUrl: sign.publicUrl,
        resourceType,
        bytes: (file as File).size ?? 0,
        createdAt: new Date().toISOString(),
      };
    },

    /** R2 phục vụ file gốc — không có transformation phía CDN. */
    buildUrl(url) {
      return url;
    },

    buildThumb(url) {
      return url;
    },
  };
}
