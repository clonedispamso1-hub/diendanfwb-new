/**
 * NỘI QUY CỘNG ĐỒNG theo Tỉnh/Thành phố.
 * Dùng chung public.admin_site_settings; không tạo bảng mới.
 */
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { applyRegion } from "@/lib/crm-guide-content";
import { toProvince } from "@/lib/crm-guide-regions";

const DB_KEY = "crm_community_rules";
const CACHE_KEY = "crm.community.rules.v1";

export interface CommunityRule {
  id: string;
  title: string;
  content: string;
  order: number;
  enabled: boolean;
}

export type CommunityRuleMap = Record<string, CommunityRule[]>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function normalizeList(value: unknown): CommunityRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const item = (raw ?? {}) as Partial<CommunityRule>;
      return {
        id: String(item.id ?? `rule-${index + 1}`),
        title: String(item.title ?? "").trim(),
        content: String(item.content ?? "").trim(),
        order: Number(item.order ?? index + 1) || index + 1,
        enabled: item.enabled !== false,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function normalizeMap(value: unknown): CommunityRuleMap {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([province, list]) => [province, normalizeList(list)]));
}

export function cachedCommunityRules(): CommunityRuleMap {
  if (typeof window === "undefined") return {};
  try {
    return normalizeMap(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return {};
  }
}

function writeCache(map: CommunityRuleMap) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export async function fetchCommunityRules(): Promise<CommunityRuleMap> {
  let value: unknown = null;
  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: DB_KEY });
  if (!error) value = rpcData;
  if (!isObject(value)) {
    const { data } = await supabase.from("admin_site_settings").select("value").eq("key", DB_KEY).maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }
  const map = normalizeMap(value);
  writeCache(map);
  return map;
}

export function communityRulesFor(map: CommunityRuleMap, rawProvince: string): CommunityRule[] {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  return normalizeList(map[province] ?? []);
}

export async function persistCommunityRules(
  map: CommunityRuleMap,
  rawProvince: string,
  list: CommunityRule[],
): Promise<CommunityRuleMap> {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  if (!province) throw new Error("Chưa chọn khu vực (Tỉnh/Thành phố).");
  const next = { ...map, [province]: normalizeList(list) };
  await adminSetSiteSetting(DB_KEY, next);
  writeCache(next);
  return next;
}

export function activeCommunityRules(list: CommunityRule[], province: string) {
  return list
    .filter((item) => item.enabled && (item.title || item.content))
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      title: applyRegion(item.title, province),
      content: applyRegion(item.content, province),
    }));
}
