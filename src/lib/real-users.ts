/**
 * Lọc "user thật" — loại tài khoản thứ hai/clone/internal.
 * Chỉ ĐỌC bảng profiles hiện có (không tạo bảng mới, không ghi log).
 */
import { supabase } from "@/lib/supabase";

const sb: any = supabase;

/** Trả về Set các id là user thật (account_source IS NULL OR account_source != 'internal'). */
export async function filterRealUserIds(ids: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return set;
  try {
    const { data, error } = await sb.from("profiles").select("id, account_source").in("id", unique);
    if (error) {
      console.error("[filterRealUserIds] profiles query error:", error);
    }
    (data || []).forEach((p: any) => {
      const src = p?.account_source;
      if (src === null || src !== "internal") set.add(p.id);
    });
  } catch (err) {
    console.error("[filterRealUserIds] unexpected error:", err);
    unique.forEach((id) => set.add(id));
  }
  return set;
}
