// Hệ thống filter dùng chung cho clone (Tin nhắn / Đăng bài / Bình luận).
// Lấy gender + khu vực của profile theo lô (batch) và cache bằng React Query,
// nên nhiều tab dùng chung một request duy nhất — không fetch lại mỗi thao tác.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/db/router";

const sb = supabase as any;

export type GenderFilter = "all" | "male" | "female";

export type ProfileMeta = {
  id: string;
  gender: string | null;
  province: string | null;
};

export const GENDER_OPTIONS: Array<{ value: GenderFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

/** Chuẩn hoá giá trị gender về "male" | "female" | null. */
export function normGender(raw: unknown): "male" | "female" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "male" || s === "m" || s === "nam" || s === "1") return "male";
  if (s === "female" || s === "f" || s === "nu" || s === "nữ" || s === "0") return "female";
  return null;
}

/** Chuẩn hoá tên tỉnh/thành để so sánh (bỏ dấu, bỏ tiền tố "tỉnh/tp"). */
export function normProvince(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\b(tinh|thanh pho|tp\.?|t\.p\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Hai tên khu vực có cùng chỉ một tỉnh/thành hay không. */
export function sameProvince(a: unknown, b: unknown): boolean {
  const x = normProvince(a);
  const y = normProvince(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "ho chi minh" vs "sai gon" vs "hcm"
  const alias = (v: string) =>
    /ho chi minh|sai gon|hcm|sg/.test(v) ? "hcm" : /ha noi|hn/.test(v) ? "hn" : v;
  return alias(x) === alias(y);
}

const PROFILE_META_COLS = "id, gender, province, region, location";

/**
 * Lấy gender + khu vực cho danh sách id (chỉ select đúng cột cần thiết).
 * Cache 5 phút, không refetch khi focus lại tab → giảm request thừa.
 */
export function useProfileMeta(ids: string[]) {
  const key = useMemo(() => Array.from(new Set(ids)).sort(), [ids]);

  const query = useQuery({
    queryKey: ["admin", "profile-meta", key],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const out = new Map<string, ProfileMeta>();
      const CHUNK = 300;
      for (let i = 0; i < key.length; i += CHUNK) {
        const slice = key.slice(i, i + CHUNK);
        const { data, error } = await sb
          .from("profiles")
          .select(PROFILE_META_COLS)
          .in("id", slice);
        if (error) throw error;
        for (const row of (data ?? []) as any[]) {
          out.set(row.id, {
            id: row.id,
            gender: normGender(row.gender),
            province: row.province || row.region || row.location || null,
          });
        }
      }
      return out;
    },
  });

  const empty = useMemo(() => new Map<string, ProfileMeta>(), []);
  return query.data ?? empty;
}

/** Lọc một danh sách có `id` theo gender + khu vực. */
export function filterByMeta<T extends { id: string }>(
  rows: readonly T[],
  meta: Map<string, ProfileMeta>,
  gender: GenderFilter,
  province: string,
): T[] {
  if (gender === "all" && !province) return rows as T[];
  return rows.filter((r) => {
    const m = meta.get(r.id);
    if (gender !== "all" && (m?.gender ?? null) !== gender) return false;
    if (province && !sameProvince(m?.province, province)) return false;
    return true;
  });
}
