/**
 * MỤC CON LỚP 1 của 3 card quốc gia (popup "VIP Zalo") + KHO ẢNH Zalo / LINE.
 * Dữ liệu lưu trên Supabase #4:
 *   - bảng `public.zalo_sub_items_l1`
 *   - bảng `public.zalo_media_library` (+ bucket công khai `zalo-media`)
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-19_zalo_sub_items_l1.sql
 * Lưu ý: lần này CHỈ dùng trong Admin Panel, chưa nối sang popup user.
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";

export const ZALO_SUB_ITEMS_TABLE = "zalo_sub_items_l1";
export const ZALO_MEDIA_TABLE = "zalo_media_library";
export const ZALO_MEDIA_BUCKET = "zalo-media";

export type ZaloMediaKind = "zalo" | "line";

export interface ZaloSubItemL1 {
  id: string;
  country_id: CountryFlagId;
  name: string;
  subtitle: string;
  image_url: string | null;
  enabled: boolean;
  sort_order: number;
  /** Số khu vực hiển thị cho mục "VIP ZALO {LOCATION}" (0 = tất cả). */
  area_limit: number;
}

export interface ZaloMediaAsset {
  id: string;
  url: string;
  label: string;
  kind: ZaloMediaKind;
}

function normalizeItem(r: any): ZaloSubItemL1 {
  return {
    id: String(r.id),
    country_id: (r.country_id as CountryFlagId) ?? "vn",
    name: String(r.name ?? ""),
    subtitle: typeof r.subtitle === "string" ? r.subtitle : "",
    image_url: r.image_url ?? null,
    enabled: r.enabled !== false,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    area_limit: Math.max(0, Math.floor(Number(r.area_limit) || 0)),
  };
}

/* ----------------------------- Mục lớp 1 ----------------------------- */

export async function listZaloSubItems(countryId: CountryFlagId): Promise<ZaloSubItemL1[]> {
  const { data, error } = await sb4()
    .from(ZALO_SUB_ITEMS_TABLE)
    .select("id, country_id, name, subtitle, image_url, enabled, sort_order, area_limit")
    .eq("country_id", countryId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []).map(normalizeItem);
}

/** Đếm số mục lớp 1 theo từng quốc gia (vn / tw / jp) cho 3 thẻ CHA. */
export async function countZaloSubItemsByCountry(): Promise<Record<string, number>> {
  const { data, error } = await sb4().from(ZALO_SUB_ITEMS_TABLE).select("country_id");
  if (error) throw new Error(error.message);
  const out: Record<string, number> = { vn: 0, tw: 0, jp: 0 };
  for (const r of ((data as any[]) ?? [])) {
    const k = String(r?.country_id ?? "");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function createZaloSubItem(input: {
  country_id: CountryFlagId;
  name: string;
  subtitle?: string;
  image_url?: string | null;
  sort_order?: number;
  area_limit?: number;
}): Promise<void> {
  const { error } = await sb4Admin()
    .from(ZALO_SUB_ITEMS_TABLE)
    .insert({
      country_id: input.country_id,
      name: input.name,
      subtitle: input.subtitle ?? "",
      image_url: input.image_url ?? null,
      sort_order: input.sort_order ?? 0,
      area_limit: Math.max(0, Math.floor(Number(input.area_limit) || 0)),
      enabled: true,
    } as any);
  if (error) throw new Error(error.message);
}

export async function updateZaloSubItem(
  id: string,
  patch: Partial<
    Pick<
      ZaloSubItemL1,
      "name" | "subtitle" | "image_url" | "enabled" | "sort_order" | "area_limit"
    >
  >,
): Promise<void> {
  const { error } = await sb4Admin()
    .from(ZALO_SUB_ITEMS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteZaloSubItem(id: string): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_SUB_ITEMS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Đổi vị trí 2 mục (lên / xuống) bằng cách hoán đổi sort_order. */
export async function swapZaloSubItemOrder(a: ZaloSubItemL1, b: ZaloSubItemL1): Promise<void> {
  await updateZaloSubItem(a.id, { sort_order: b.sort_order });
  await updateZaloSubItem(b.id, { sort_order: a.sort_order });
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
