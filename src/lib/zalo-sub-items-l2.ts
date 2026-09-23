/**
 * MỤC LỚP 2 của những mục lớp 1 KHÔNG theo tỉnh/thành (ví dụ "VIP ZALO MIỄN PHÍ").
 * Bảng: public.zalo_sub_items_l2 (Supabase #4)
 * SQL: supabase-sql/SB4/2026-09-19e_zalo_sub_items_l2.sql
 *      supabase-sql/SB4/2026-09-19f_zalo_sub_items_l2_stats.sql (số liệu + join_url)
 *
 * Nhóm của từng mục lớp 2 dùng LẠI bảng cũ `zalo_area_groups` với:
 *   item_id = mục lớp 1 cha, province = '', area_id = id của mục lớp 2.
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";

export const ZALO_SUB_ITEMS_L2_TABLE = "zalo_sub_items_l2";

export interface ZaloSubItemL2 {
  id: string;
  parent_item_id: string;
  name: string;
  subtitle: string;
  image_url: string | null;
  enabled: boolean;
  sort_order: number;
  /** Số liệu thành viên (admin nhập tổng, hệ thống tự chia). */
  member_count: number;
  men_count: number;
  women_count: number;
  gold_key: number;
  silver_key: number;
  join_url: string;
}

const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

function normalize(r: any): ZaloSubItemL2 {
  return {
    id: String(r.id),
    parent_item_id: String(r.parent_item_id),
    name: String(r.name ?? ""),
    subtitle: typeof r.subtitle === "string" ? r.subtitle : "",
    image_url: r.image_url ?? null,
    enabled: r.enabled !== false,
    sort_order: num(r.sort_order),
    member_count: num(r.member_count),
    men_count: num(r.men_count),
    women_count: num(r.women_count),
    gold_key: num(r.gold_key),
    silver_key: num(r.silver_key),
    join_url: String(r.join_url ?? ""),
  };
}

const STAT_FIELDS = [
  "member_count",
  "men_count",
  "women_count",
  "gold_key",
  "silver_key",
  "join_url",
] as const;

const isMissingColumn = (msg: string) =>
  /column .* does not exist|could not find the .* column/i.test(msg);

const withoutStats = <T extends Record<string, any>>(row: T) => {
  const out: Record<string, any> = { ...row };
  for (const k of STAT_FIELDS) delete out[k];
  return out;
};

export async function listZaloSubItemsL2(
  parentItemId: string,
  opts: { onlyEnabled?: boolean } = {},
): Promise<ZaloSubItemL2[]> {
  let q = sb4().from(ZALO_SUB_ITEMS_L2_TABLE).select("*").eq("parent_item_id", parentItemId);
  if (opts.onlyEnabled) q = q.eq("enabled", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []).map(normalize);
}

export async function createZaloSubItemL2(input: {
  parent_item_id: string;
  name: string;
  subtitle?: string;
  image_url?: string | null;
  sort_order?: number;
  member_count?: number;
  men_count?: number;
  women_count?: number;
  gold_key?: number;
  silver_key?: number;
  join_url?: string;
}): Promise<void> {
  const row = {
    parent_item_id: input.parent_item_id,
    name: input.name,
    subtitle: input.subtitle ?? "",
    image_url: input.image_url ?? null,
    sort_order: input.sort_order ?? 0,
    enabled: true,
    member_count: num(input.member_count),
    men_count: num(input.men_count),
    women_count: num(input.women_count),
    gold_key: num(input.gold_key),
    silver_key: num(input.silver_key),
    join_url: input.join_url ?? "",
  };
  const { error } = await sb4Admin().from(ZALO_SUB_ITEMS_L2_TABLE).insert(row as any);
  if (!error) return;
  if (!isMissingColumn(error.message)) throw new Error(error.message);
  const retry = await sb4Admin().from(ZALO_SUB_ITEMS_L2_TABLE).insert(withoutStats(row) as any);
  if (retry.error) throw new Error(retry.error.message);
}

export async function updateZaloSubItemL2(
  id: string,
  patch: Partial<
    Pick<
      ZaloSubItemL2,
      | "name"
      | "subtitle"
      | "image_url"
      | "enabled"
      | "sort_order"
      | "member_count"
      | "men_count"
      | "women_count"
      | "gold_key"
      | "silver_key"
      | "join_url"
    >
  >,
): Promise<void> {
  const row = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await sb4Admin()
    .from(ZALO_SUB_ITEMS_L2_TABLE)
    .update(row as any)
    .eq("id", id);
  if (!error) return;
  if (!isMissingColumn(error.message)) throw new Error(error.message);
  const retry = await sb4Admin()
    .from(ZALO_SUB_ITEMS_L2_TABLE)
    .update(withoutStats(row) as any)
    .eq("id", id);
  if (retry.error) throw new Error(retry.error.message);
}

export async function deleteZaloSubItemL2(id: string): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_SUB_ITEMS_L2_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function swapZaloSubItemL2Order(a: ZaloSubItemL2, b: ZaloSubItemL2): Promise<void> {
  await updateZaloSubItemL2(a.id, { sort_order: b.sort_order });
  await updateZaloSubItemL2(b.id, { sort_order: a.sort_order });
}
