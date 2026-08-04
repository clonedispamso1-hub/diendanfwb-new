/**
 * Cloudinary media provider (signed upload).
 *
 * Bảo mật:
 *   • API Secret CHỈ nằm ở server (env `CLOUDINARY_API_SECRET`).
 *   • Client xin chữ ký ở `/api/public/cloudinary-sign` (yêu cầu đăng nhập),
 *     rồi POST thẳng file lên `https://api.cloudinary.com/v1_1/<cloud>/auto/upload`.
 *   • Không log / không hiển thị key, secret ở bất kỳ đâu.
 *
 * Chỉ nhận ảnh/video hợp lệ, giới hạn dung lượng, chặn file thực thi.
 */

import type { MediaProvider, ResourceType, UploadedMedia } from "../types";
import { supabase } from "@/lib/supabase";

const CLOUDINARY_URL_RE = /^https?:\/\/res\.cloudinary\.com\//i;

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

export interface CloudinaryProviderConfig {
  name?: string;
  /** Endpoint ký upload phía server. */
  signEndpoint?: string;
  enabled?: boolean;
}

function detectResourceType(file: File | Blob): ResourceType {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  return "raw";
}

function assertAllowed(file: File | Blob, filename: string) {
  const type = (file.type || "").toLowerCase();
  if (/\.(exe|sh|bat|cmd|js|jar|apk|msi|php|py|dll|scr)$/i.test(filename)) {
    throw new Error("Định dạng tệp không được phép.");
  }
  if (ALLOWED_IMAGE.has(type)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Ảnh vượt quá 15MB.");
    return;
  }
  if (ALLOWED_VIDEO.has(type)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video vượt quá 100MB.");
    return;
  }
  throw new Error("Chỉ hỗ trợ ảnh (jpg, png, webp, gif) hoặc video (mp4, webm, mov).");
}

/** Chèn f_auto,q_auto vào URL delivery của Cloudinary. */
function withAutoFormat(url: string): string {
  if (!CLOUDINARY_URL_RE.test(url)) return url;
  if (/\/upload\/(?:[^/]*[,/])?f_auto/.test(url)) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}

export function createCloudinaryProvider(
  config: CloudinaryProviderConfig = {},
): MediaProvider {
  const name = config.name ?? "cloudinary";
  const signEndpoint = config.signEndpoint ?? "/api/public/cloudinary-sign";

  return {
    name,

    isEnabled() {
      return config.enabled !== false;
    },

    ownsUrl(url) {
      return CLOUDINARY_URL_RE.test(url);
    },

    async upload(file, filename, opts): Promise<UploadedMedia> {
      assertAllowed(file, filename);
      const resourceType = detectResourceType(file);
      const folder = String(opts.folder || "candy").replace(/^\/+|\/+$/g, "");

      // ---- Chế độ 1: Unsigned Upload Preset (không cần server ký) ----
      const unsignedCloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
      const unsignedPreset = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined)?.trim();

      let endpoint: string;
      let formFields: Record<string, string>;

      if (unsignedCloud && unsignedPreset) {
        endpoint = `https://api.cloudinary.com/v1_1/${unsignedCloud}/auto/upload`;
        formFields = { upload_preset: unsignedPreset, folder };
      } else {
        // ---- Chế độ 2: Signed upload qua server ----
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
          body: JSON.stringify({ folder }),
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
            `Không lấy được chữ ký upload (${signRes.status})${detail ? `: ${detail}` : ""}`,
          );
        }
        const sign = (await signRes.json()) as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          folder: string;
          signature: string;
        };
        endpoint = `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`;
        formFields = {
          api_key: sign.apiKey,
          timestamp: String(sign.timestamp),
          folder: sign.folder,
          signature: sign.signature,
        };
      }

      const json = await new Promise<any>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file, filename);
        for (const [k, v] of Object.entries(formFields)) form.append(k, v);


        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);
        xhr.responseType = "text";
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && opts.onProgress) {
            opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () => {
          const text = String(xhr.responseText || "");
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(new Error("Cloudinary trả về dữ liệu không hợp lệ."));
            }
          } else {
            let msg = "";
            try {
              msg = JSON.parse(text)?.error?.message || "";
            } catch {
              /* ignore */
            }
            reject(new Error(`Cloudinary upload failed (${xhr.status})${msg ? `: ${msg}` : ""}`));

          }
        };
        xhr.onerror = () => reject(new Error("Cloudinary: lỗi mạng."));
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        if (opts.signal) {
          if (opts.signal.aborted) xhr.abort();
          else opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.send(form);
      });

      opts.onProgress?.(100);

      const secureUrl: string = json.secure_url;
      if (!secureUrl) throw new Error("Cloudinary không trả về secure_url.");

      return {
        provider: name,
        publicId: json.public_id ?? secureUrl,
        secureUrl,
        resourceType: (json.resource_type as ResourceType) || resourceType,
        bytes: json.bytes ?? (file as File).size ?? 0,
        width: json.width,
        height: json.height,
        duration: json.duration,
        createdAt: json.created_at ?? new Date().toISOString(),
      };
    },

    buildUrl(url) {
      return withAutoFormat(url);
    },

    buildThumb(url, width) {
      if (!CLOUDINARY_URL_RE.test(url)) return url;
      return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${Math.round(width)}/`);
    },
  };
}
