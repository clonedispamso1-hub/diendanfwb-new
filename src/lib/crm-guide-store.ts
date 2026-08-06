/**
 * LƯU VĨNH VIỄN nội dung "Hướng dẫn Admin" trong Supabase.
 *
 * Bảng: public.admin_site_settings (key text primary key, value jsonb)
 * Key:  "crm_guide_sections"
 * Ghi:  RPC admin_set_site_setting (SECURITY DEFINER) → fallback upsert bảng.
 * Đọc:  RPC get_site_setting → fallback select bảng.
 *
 * QUY TẮC: KHÔNG bao giờ tự ghi đè dữ liệu Admin bằng nội dung mặc định.
 * Nội dung mặc định chỉ dùng khi DB chưa có bản ghi nào, hoặc khi Admin
 * chủ động bấm "Khôi phục mặc định".
 *
 * localStorage chỉ là cache để hiển thị tức thì, không phải nguồn dữ liệu.
 */
import { supabase } from "@/integrations/supabase/client";
import { adminDb } from "@/lib/admin-db";
import { uploadMedia } from "@/lib/media";
import { cloneDefaultSections, type GuideSection } from "./crm-guide-content";

const DB_KEY = "crm_guide_sections";
const CACHE_KEY = "crm.guide.sections.cache.v2";

function isSections(v: unknown): v is GuideSection[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (s) =>
        s &&
        typeof (s as GuideSection).id === "string" &&
        Array.isArray((s as GuideSection).blocks),
    )
  );
}

/** Cache cục bộ — dùng để vẽ ngay khi mở popup, trước khi Supabase trả về. */
export function cachedGuideSections(): GuideSection[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSections(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(sections: GuideSection[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(sections));
  } catch {
    /* ignore */
  }
}

/** Đọc từ Supabase. Trả về mặc định CHỈ khi DB chưa có gì. */
export async function fetchGuideSections(): Promise<GuideSection[]> {
  let value: unknown = null;

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_site_setting", {
    _key: DB_KEY,
  });
  if (!rpcError) value = rpcData;

  if (!isSections(value)) {
    const { data } = await supabase
      .from("admin_site_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    value = (data as { value?: unknown } | null)?.value ?? null;
  }

  if (isSections(value)) {
    writeCache(value);
    return value;
  }

  // DB trống → dùng mặc định (KHÔNG ghi vào DB, tránh ghi đè về sau).
  return cloneDefaultSections();
}

/** Lưu vĩnh viễn vào Supabase. Ném lỗi nếu không lưu được (để UI báo đỏ). */
export async function persistGuideSections(sections: GuideSection[]): Promise<void> {
  if (!isSections(sections)) throw new Error("Dữ liệu hướng dẫn không hợp lệ.");
  const db = (await adminDb()) as never as {
    rpc: (fn: string, args: unknown) => Promise<{ error: unknown }>;
    from: (t: string) => {
      upsert: (row: unknown, opts: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { error: rpcError } = await db.rpc("admin_set_site_setting", {
    _key: DB_KEY,
    _value: sections,
  });
  if (!rpcError) {
    writeCache(sections);
    return;
  }

  const { error } = await db
    .from("admin_site_settings")
    .upsert({ key: DB_KEY, value: sections }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  writeCache(sections);
}

/** Chỉ chạy khi Admin chủ động bấm "Khôi phục mặc định". */
export async function restoreDefaultGuideSections(): Promise<GuideSection[]> {
  const defaults = cloneDefaultSections();
  await persistGuideSections(defaults);
  return defaults;
}

/** Upload ảnh của block lên Supabase Storage, trả về URL công khai. */
export async function uploadGuideImage(file: File): Promise<string> {
  const uploaded = await uploadMedia(file, { kind: "post", compress: true });
  const url = uploaded.secureUrl;
  if (!url) throw new Error("Không lấy được URL ảnh sau khi tải lên.");
  return url;
}
