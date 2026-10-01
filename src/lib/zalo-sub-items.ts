/**
 * KHO ẢNH Zalo / LINE (dùng chung cho CRM).
 * Dữ liệu lưu trên Supabase #4: bảng `public.zalo_media_library` (+ bucket công khai `zalo-media`).
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";

export const ZALO_MEDIA_TABLE = "zalo_media_library";
export const ZALO_MEDIA_BUCKET = "zalo-media";

export type ZaloMediaKind = "zalo" | "line";

export interface ZaloMediaAsset {
  id: string;
  url: string;
  label: string;
  kind: ZaloMediaKind;
}

/* ---------------------------- Kho ảnh ------------------------------- */

export async function listZaloMedia(): Promise<ZaloMediaAsset[]> {
  const { data, error } = await sb4()
    .from(ZALO_MEDIA_TABLE)
    .select("id, url, label, kind")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []).map((r) => ({
    id: String(r.id),
    url: String(r.url),
    label: String(r.label ?? ""),
    kind: (r.kind as ZaloMediaKind) === "line" ? "line" : "zalo",
  }));
}

/** Upload 1 ảnh lên bucket công khai và lưu vào kho. */
export async function addZaloMedia(
  file: File,
  opts: { kind: ZaloMediaKind; label?: string },
): Promise<ZaloMediaAsset> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `${opts.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext || "png"}`;
  const client = sb4Admin();
  const up = await client.storage.from(ZALO_MEDIA_BUCKET).upload(key, file, {
    upsert: true,
    contentType: file.type || "image/png",
    cacheControl: "3600",
  });
  if (up.error) throw new Error(up.error.message);
  const { data } = client.storage.from(ZALO_MEDIA_BUCKET).getPublicUrl(key);
  const url = data?.publicUrl;
  if (!url) throw new Error("Không lấy được đường dẫn ảnh.");

  const label = (opts.label || file.name || "").slice(0, 80);
  const { data: row, error } = await client
    .from(ZALO_MEDIA_TABLE)
    .insert({ url, label, kind: opts.kind } as any)
    .select("id, url, label, kind")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    id: String((row as any)?.id ?? url),
    url,
    label,
    kind: opts.kind,
  };
}

export async function deleteZaloMedia(asset: ZaloMediaAsset): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_MEDIA_TABLE).delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
}
