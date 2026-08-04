/**
 * Parallel upload helper — client-side resize (đã được MediaService xử lý),
 * upload song song với concurrency limit, tổng progress, và retry.
 *
 * Provider do MediaService quyết định (Cloudinary).
 */
import { uploadMediaUrl, type UploadOptions } from "@/lib/media";

export type ParallelUploadItem = {
  file: File | Blob;
  /** 0..100, tiến độ file này */
  progress: number;
  /** URL sau upload */
  url?: string;
  error?: string;
  status: "pending" | "uploading" | "done" | "error";
};

export type ParallelUploadOptions = UploadOptions & {
  /** Số upload song song. Mặc định 3 — tối ưu cho 3G/4G Việt Nam. */
  concurrency?: number;
  /** Số lần retry mỗi file khi lỗi. Mặc định 2. */
  retries?: number;
  /** Callback tổng: percent 0..100 + items snapshot. */
  onOverallProgress?: (percent: number, items: ParallelUploadItem[]) => void;
};

/**
 * Upload nhiều file song song, có progress + retry.
 * Trả về mảng URL theo đúng thứ tự file đầu vào (hoặc null nếu file đó fail).
 */
export async function uploadFilesParallel(
  files: (File | Blob)[],
  opts: ParallelUploadOptions,
): Promise<(string | null)[]> {
  const items: ParallelUploadItem[] = files.map((file) => ({
    file,
    progress: 0,
    status: "pending",
  }));

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 6));
  const retries = opts.retries ?? 2;

  const emit = () => {
    if (!opts.onOverallProgress) return;
    const total = items.reduce((s, it) => s + it.progress, 0);
    const percent = items.length ? Math.round(total / items.length) : 100;
    opts.onOverallProgress(percent, items.map((it) => ({ ...it })));
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const idx = cursor++;
      const it = items[idx];
      it.status = "uploading";
      emit();
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const url = await uploadMediaUrl(it.file, {
            ...opts,
            onProgress: (p) => {
              it.progress = Math.max(it.progress, Math.min(99, p));
              emit();
            },
          });
          it.url = url;
          it.progress = 100;
          it.status = "done";
          emit();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < retries) {
            // exponential backoff nhẹ
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      }
      if (lastErr) {
        it.status = "error";
        it.error = lastErr instanceof Error ? lastErr.message : String(lastErr);
        it.progress = 100; // để overall progress không đứng
        emit();
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, () => worker()),
  );

  return items.map((it) => it.url ?? null);
}
