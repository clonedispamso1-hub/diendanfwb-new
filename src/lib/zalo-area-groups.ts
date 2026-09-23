/**
 * LỚP 2: danh sách NHÓM của từng KHU VỰC (bảng `zalo_area_groups`, Supabase #4).
 *
 * Phạm vi (scope) của một nhóm = platform + country_id + item_id + province + area_id,
 * nên cùng một hệ thống dùng được cho Zalo / LINE và VN / TW / JP.
 * SQL: supabase-sql/SB4/2026-09-19d_zalo_area_groups.sql
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";

export const ZALO_AREA_GROUPS_TABLE = "zalo_area_groups";

export type ZaloPlatform = "zalo" | "line";

export interface ZaloAreaGroupScope {
  platform?: ZaloPlatform;
  country_id: CountryFlagId;
  item_id: string;
  province?: string;
  area_id?: string;
}

export interface ZaloAreaGroup {
  id: string;
  platform: ZaloPlatform;
  country_id: CountryFlagId;
  item_id: string;
  province: string;
  area_id: string;
  name: string;
  avatar_url: string | null;
  member_count: number;
  men_count: number;
  women_count: number;
  gold_key: number;
  silver_key: number;
  join_url: string;
  enabled: boolean;
  sort_order: number;
}

const COLS =
  "id, platform, country_id, item_id, province, area_id, name, avatar_url, member_count, men_count, women_count, gold_key, silver_key, join_url, enabled, sort_order";

const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

function normalize(r: any): ZaloAreaGroup {
  return {
    id: String(r.id),
    platform: r.platform === "line" ? "line" : "zalo",
    country_id: (r.country_id as CountryFlagId) ?? "vn",
    item_id: String(r.item_id),
    province: String(r.province ?? ""),
    area_id: String(r.area_id ?? ""),
    name: String(r.name ?? ""),
    avatar_url: r.avatar_url ?? null,
    member_count: num(r.member_count),
    men_count: num(r.men_count),
    women_count: num(r.women_count),
    gold_key: num(r.gold_key),
    silver_key: num(r.silver_key),
    join_url: String(r.join_url ?? ""),
    enabled: r.enabled !== false,
    sort_order: num(r.sort_order),
  };
}

/** Danh sách nhóm của ĐÚNG một khu vực (không lẫn khu vực khác). */
export async function listZaloAreaGroups(
  scope: ZaloAreaGroupScope,
  opts: { onlyEnabled?: boolean } = {},
): Promise<ZaloAreaGroup[]> {
  let q = sb4()
    .from(ZALO_AREA_GROUPS_TABLE)
    .select(COLS)
    .eq("platform", scope.platform ?? "zalo")
    .eq("country_id", scope.country_id)
    .eq("item_id", scope.item_id)
    .eq("province", scope.province ?? "")
    .eq("area_id", scope.area_id ?? "");
  if (opts.onlyEnabled) q = q.eq("enabled", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []).map(normalize);
}

/** Đếm số nhóm theo từng khu vực của một mục lớp 1 (cho Admin). */
export async function countZaloAreaGroups(
  scope: Omit<ZaloAreaGroupScope, "area_id">,
): Promise<Record<string, number>> {
  const { data, error } = await sb4()
    .from(ZALO_AREA_GROUPS_TABLE)
    .select("area_id")
    .eq("platform", scope.platform ?? "zalo")
    .eq("item_id", scope.item_id)
    .eq("province", scope.province ?? "");
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of ((data as any[]) ?? [])) {
    const k = String(r?.area_id ?? "");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export type ZaloAreaGroupInput = Pick<
  ZaloAreaGroup,
  | "name"
  | "avatar_url"
  | "member_count"
  | "men_count"
  | "women_count"
  | "gold_key"
  | "silver_key"
  | "join_url"
> & { sort_order?: number };

export async function createZaloAreaGroup(
  scope: ZaloAreaGroupScope,
  input: ZaloAreaGroupInput,
): Promise<void> {
  const { error } = await sb4Admin()
    .from(ZALO_AREA_GROUPS_TABLE)
    .insert({
      platform: scope.platform ?? "zalo",
      country_id: scope.country_id,
      item_id: scope.item_id,
      province: scope.province ?? "",
      area_id: scope.area_id ?? "",
      name: input.name,
      avatar_url: input.avatar_url ?? null,
      member_count: num(input.member_count),
      men_count: num(input.men_count),
      women_count: num(input.women_count),
      gold_key: num(input.gold_key),
      silver_key: num(input.silver_key),
      join_url: input.join_url ?? "",
      enabled: true,
      sort_order: num(input.sort_order),
    } as any);
  if (error) throw new Error(error.message);
}

export async function updateZaloAreaGroup(
  id: string,
  patch: Partial<Omit<ZaloAreaGroup, "id" | "item_id" | "country_id" | "platform">>,
): Promise<void> {
  const { error } = await sb4Admin()
    .from(ZALO_AREA_GROUPS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteZaloAreaGroup(id: string): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_AREA_GROUPS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function swapZaloAreaGroupOrder(a: ZaloAreaGroup, b: ZaloAreaGroup): Promise<void> {
  await updateZaloAreaGroup(a.id, { sort_order: b.sort_order });
  await updateZaloAreaGroup(b.id, { sort_order: a.sort_order });
}
