/**
 * Cấu hình Phí CR dùng chung cho mọi khách hàng.
 * Dùng lại public.admin_site_settings; không tạo bảng hay migration mới.
 */
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { applyRegion } from "@/lib/crm-guide-content";

const DB_KEY = "crm_fee_config";
const CACHE_KEY = "crm.fee.config.v1";

export interface FeeNote {
  id: string;
  content: string;
  order: number;
  enabled: boolean;
}

export interface FeeConfig {
  eight_months: string;
  lifetime: string;
  notes: FeeNote[];
}

export interface ActiveFeeConfig {
  eight_months: string;
  lifetime: string;
  notes: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function normalizeNotes(value: unknown): FeeNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const note = (raw ?? {}) as Partial<FeeNote>;
      return {
        id: String(note.id ?? `fee-note-${index + 1}`),
        content: String(note.content ?? "").trim(),
        order: Number(note.order ?? index + 1) || index + 1,
        enabled: note.enabled !== false,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export function normalizeFeeConfig(value: unknown, legacyText = ""): FeeConfig {
  if (!isObject(value)) {
    return { eight_months: String(legacyText ?? "").trim(), lifetime: "", notes: [] };
  }
  return {
    eight_months: String(value.eight_months ?? "").trim(),
    lifetime: String(value.lifetime ?? "").trim(),
    notes: normalizeNotes(value.notes),
  };
}

export function cachedFeeConfig(legacyText = ""): FeeConfig {
  if (typeof window === "undefined") return normalizeFeeConfig(null, legacyText);
  try {
    return normalizeFeeConfig(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null"), legacyText);
  } catch {
    return normalizeFeeConfig(null, legacyText);
  }
}

function writeCache(config: FeeConfig) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
}

export async function fetchFeeConfig(legacyText = ""): Promise<FeeConfig> {
  let value: unknown = null;
  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: DB_KEY });
  if (!error) value = rpcData;
  if (!isObject(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }
  const config = normalizeFeeConfig(value, legacyText);
  writeCache(config);
  return config;
}

export async function persistFeeConfig(config: FeeConfig): Promise<FeeConfig> {
  const normalized = normalizeFeeConfig(config);
  await adminSetSiteSetting(DB_KEY, normalized);
  writeCache(normalized);
  return normalized;
}

export function activeFeeConfig(config: FeeConfig, region: string): ActiveFeeConfig {
  return {
    eight_months: applyRegion(config.eight_months, region),
    lifetime: applyRegion(config.lifetime, region),
    notes: config.notes
      .filter((note) => note.enabled && note.content.trim())
      .sort((a, b) => a.order - b.order)
      .map((note) => applyRegion(note.content.trim(), region)),
  };
}