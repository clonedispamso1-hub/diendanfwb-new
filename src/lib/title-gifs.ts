/**
 * Danh hiệu GIF — registry trong bảng `public.title_gifs` (Supabase),
 * file thực tế upload qua **Cloudinary** (folder `FWB/GIF`).
 *
 * Admin có thể:
 *  - Upload .gif / .webp lên Cloudinary (folder `FWB/GIF`)
 *  - Xoá khỏi registry (kèm reset title_gif_url của tất cả user đang dùng)
 *
 * Yêu cầu chạy 1 lần: db/2026051800_title_gifs_registry.sql
 */
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/media";

export const TITLES_BUCKET = "titles"; // legacy, giữ để không vỡ import cũ
export const TITLES_ALLOWED_MIME = ["image/gif", "image/webp"];
export const TITLES_ALLOWED_EXT = [".gif", ".webp"];

export interface TitleGif {
  /** Tên file (dùng làm label gốc + key xoá registry). */
  name: string;
  /** Cloudinary URL. */
  url: string;
  /** Nhãn hiển thị (= tên file không có đuôi). */
  label: string;
}

function toLabel(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || name;
}

export async function listTitleGifs(): Promise<TitleGif[]> {
  const { data, error } = await (supabase.from("title_gifs" as any) as any)
    .select("name, url, label, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[title-gifs] list error:", error.message);
    return [];
  }
  return ((data as any[]) || []).map((r) => ({
    name: r.name as string,
    url: r.url as string,
    label: (r.label as string) || toLabel(r.name as string),
  }));
}

/** Upload 1 file GIF/WEBP lên Cloudinary (FWB/GIF), lưu vào registry. */
export async function uploadTitleGif(file: File): Promise<TitleGif> {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!TITLES_ALLOWED_EXT.includes(ext)) {
    throw new Error("Vui lòng chọn file ảnh động .gif hoặc .webp");
  }
  if (!TITLES_ALLOWED_MIME.includes(file.type) && file.type !== "") {
    throw new Error("Vui lòng chọn file ảnh động .gif hoặc .webp");
  }

  const safeBase =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "title";
  const finalName = `${safeBase}-${Date.now()}${ext}`;

  // Upload thẳng lên Cloudinary (folder FWB/GIF)
  const url = await uploadFile(file, "FWB/GIF");
  const label = toLabel(finalName);

  const { error } = await (supabase.from("title_gifs" as any) as any).insert([
    { name: finalName, url, label },
  ]);
  if (error) throw new Error(error.message);

  return { name: finalName, url, label };
}

/** Xoá khỏi registry + reset title_gif_url của user đang dùng. */
export async function deleteTitleGif(gif: TitleGif): Promise<void> {
  const { error: delErr } = await (supabase.from("title_gifs" as any) as any)
    .delete()
    .eq("url", gif.url);
  if (delErr) throw new Error("Registry: " + delErr.message);

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ title_gif_url: null })
    .eq("title_gif_url", gif.url);
  if (dbErr) throw new Error("DB: " + dbErr.message);
}

export function findTitleGif(url: string | null | undefined, all: TitleGif[]): TitleGif | null {
  if (!url) return null;
  return all.find((t) => t.url === url) ?? { name: url, url, label: url.split("/").pop() ?? url };
}
