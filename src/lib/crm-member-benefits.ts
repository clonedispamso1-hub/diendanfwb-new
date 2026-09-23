/**
 * QUYỀN LỢI THÀNH VIÊN theo KHU VỰC (Tỉnh/Thành phố).
 *
 * - Reuse đúng nơi lưu cấu hình hướng dẫn hiện tại: public.admin_site_settings
 *   (key "crm_member_benefits"), KHÔNG tạo bảng/migration mới.
 * - Mỗi tỉnh/thành có danh sách quyền lợi riêng: tiêu đề + nội dung + thứ tự + bật/tắt.
 * - Không sinh dữ liệu giả khi Admin chưa nhập.
 */
import { supabase } from "@/lib/db/router";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { toProvince } from "@/lib/crm-guide-regions";

const DB_KEY = "crm_member_benefits";
const CACHE_KEY = "crm.member.benefits.v1";

export interface MemberBenefit {
  id: string;
  title: string;
  content: string;
  order: number;
  enabled: boolean;
}

/** { "Bạc Liêu": [ {…}, {…} ] } */
export type MemberBenefitMap = Record<string, MemberBenefit[]>;

function isMap(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeList(value: unknown): MemberBenefit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, i) => {
      const b = (raw ?? {}) as Partial<MemberBenefit>;
      return {
        id: String(b.id ?? `benefit-${i + 1}`),
        title: String(b.title ?? "").trim(),
        content: String(b.content ?? "").trim(),
        order: Number(b.order ?? i + 1) || i + 1,
        enabled: b.enabled !== false,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function normalizeMap(value: unknown): MemberBenefitMap {
  if (!isMap(value)) return {};
  const out: MemberBenefitMap = {};
  Object.entries(value).forEach(([k, v]) => {
    out[k] = normalizeList(v);
  });
  return out;
}

export function cachedMemberBenefits(): MemberBenefitMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return normalizeMap(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function writeCache(map: MemberBenefitMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function fetchMemberBenefits(): Promise<MemberBenefitMap> {
  let value: unknown = null;
  const { data: rpcData, error } = await supabase.rpc("get_site_setting", { _key: DB_KEY });
  if (!error) value = rpcData;

  if (!isMap(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }

  const map = normalizeMap(value);
  writeCache(map);
  return map;
}

/** Danh sách quyền lợi của 1 tỉnh/thành (chưa có → rỗng, không tạo dữ liệu giả). */
export function memberBenefitsFor(map: MemberBenefitMap, rawProvince: string): MemberBenefit[] {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  return normalizeList(map[province] ?? []);
}

/** Lưu danh sách quyền lợi cho 1 tỉnh/thành (không ảnh hưởng tỉnh khác). */
export async function persistMemberBenefits(
  map: MemberBenefitMap,
  rawProvince: string,
  list: MemberBenefit[],
): Promise<MemberBenefitMap> {
  const province = toProvince(rawProvince) || String(rawProvince ?? "").trim();
  if (!province) throw new Error("Chưa chọn khu vực (Tỉnh/Thành phố).");
  const next: MemberBenefitMap = { ...map, [province]: normalizeList(list) };
  await adminSetSiteSetting(DB_KEY, next);
  writeCache(next);
  return next;
}

/** Thay {location} / {LOCATION} bằng tỉnh/thành của khách. */
export function applyBenefitLocation(text: string, province: string): string {
  return String(text ?? "").replace(/\{\s*location\s*\}/gi, province);
}

/** Các quyền lợi đang bật, đã sắp thứ tự, đã thay {location} — dùng khi gửi Card. */
export function activeMemberBenefits(
  list: MemberBenefit[],
  province: string,
): { title: string; content: string }[] {
  return list
    .filter((b) => b.enabled && (b.title.trim() || b.content.trim()))
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      title: applyBenefitLocation(b.title.trim(), province),
      content: applyBenefitLocation(b.content.trim(), province),
    }));
}
