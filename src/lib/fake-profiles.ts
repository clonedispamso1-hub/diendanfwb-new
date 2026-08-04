// Helpers cho fake_profiles + fake_follows phục vụ trang Kết nối FWB
import { supabase } from "@/lib/supabase";

const sb = supabase as unknown as any;

function normalizeProvince(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isFlexibleProvince(value?: string | null): boolean {
  const normalized = normalizeProvince(value);
  return !normalized || normalized === "linh hoat" || normalized === "flexible" || normalized === "toan quoc";
}

export interface FakeProfileRecord {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar: string | null;
  locale: string | null;
  vip_level: number | null;
  province: string | null;
  bio: string | null;
  gem_balance: number | null;
  is_active: boolean | null;
  created_at: string;
  tag?: string | null;
  age?: number | null;
  gender?: string | null;
}

/** Đọc danh sách nick ảo cho trang FWB.
 *  - Ưu tiên cùng province với user. Nick có province=NULL coi là "linh hoạt"
 *    và sẽ được hiển thị với khu vực = khu vực của user.
 */
export async function loadFwbFakeProfiles(opts: {
  province?: string | null;
  limit?: number;
}): Promise<FakeProfileRecord[]> {
  const { province, limit = 20 } = opts;
  const provinceKey = normalizeProvince(province);
  const { data, error } = await sb
    .from("fake_profiles")
    .select("*")
    .eq("is_active", true)
    .order("vip_level", { ascending: false })
    .limit(Math.max(limit * 4, 100));
  if (error) {
    console.error("[fwb] load fake_profiles error:", error);
    return [];
  }
  const rows = ((data || []) as FakeProfileRecord[]).filter((p) => {
    if (!provinceKey) return true;
    return normalizeProvince(p.province) === provinceKey || isFlexibleProvince(p.province);
  });
  // Inject province cho nick "linh hoạt"
  return rows.slice(0, limit).map((p) => ({
    ...p,
    province: isFlexibleProvince(p.province) ? province || null : p.province,
  }));
}

export async function adminListFakeProfiles(limit = 100): Promise<FakeProfileRecord[]> {
  const { data, error } = await sb
    .from("fake_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as FakeProfileRecord[];
}

export async function adminCreateFakeProfile(input: {
  username: string;
  display_name: string;
  avatar_url: string;
  locale?: string;
  vip_level?: number;
  province?: string | null;
  bio?: string | null;
}): Promise<FakeProfileRecord> {
  const payload = {
    username: input.username.trim(),
    display_name: input.display_name.trim(),
    full_name: input.display_name.trim(),
    avatar_url: input.avatar_url.trim(),
    avatar: input.avatar_url.trim(),
    locale: input.locale || "vi",
    vip_level: input.vip_level ?? 0,
    province: input.province?.trim() || null,
    bio: input.bio?.trim() || null,
    is_active: true,
  };
  const { data, error } = await sb.from("fake_profiles").insert(payload).select("*").single();
  if (error) throw error;
  return data as FakeProfileRecord;
}

export async function adminUpdateFakeProfile(
  id: string,
  patch: Partial<FakeProfileRecord>,
): Promise<void> {
  let { error } = await sb.from("fake_profiles").update(patch).eq("id", id);
  if (error && /column .*gem_balance.* does not exist/i.test(error.message || "")) {
    // Fallback nếu DB chưa có cột gem_balance
    const { gem_balance: _ignored, ...rest } = patch as any;
    ({ error } = await sb.from("fake_profiles").update(rest).eq("id", id));
  }
  if (error) throw error;
}

/**
 * Soft-delete seed account (KHÔNG xoá messages của user).
 * Set seed_status='inactive' + seed_deleted_at=now() + is_active=false.
 * Fallback hard-delete nếu DB chưa có cột seed_status.
 */
export async function adminDeleteFakeProfile(id: string): Promise<void> {
  const patch: any = {
    seed_status: "inactive",
    seed_deleted_at: new Date().toISOString(),
    is_active: false,
  };
  let { error } = await sb.from("fake_profiles").update(patch).eq("id", id);
  if (error && /column .* does not exist/i.test(error.message || "")) {
    // DB chưa migrate → fallback: chỉ set is_active=false để không hard-delete chat.
    ({ error } = await sb.from("fake_profiles").update({ is_active: false }).eq("id", id));
  }
  if (error) throw error;
}

/** Bulk insert seed accounts kèm batch_id. Tự lọc bỏ field DB chưa hỗ trợ.
 *  Đồng thời MIRROR vào public.profiles để các FK (messages.receiver_id, follows...) hoạt động. */
export async function adminBulkInsertFakeProfiles(
  rows: Array<Record<string, any>>,
): Promise<number> {
  if (!rows.length) return 0;
  let { data, error } = await sb.from("fake_profiles").insert(rows).select("id, username, display_name, full_name, avatar, avatar_url, province, bio, vip_level, age, gender");
  // Fallback nếu thiếu cột mới (created_by_admin, seed_batch_id, age, gender, tag, is_published)
  if (error && /column .* does not exist/i.test(error.message || "")) {
    const stripped = rows.map(({ created_by_admin, seed_batch_id, age, gender, tag, is_published, ...rest }) => rest);
    ({ data, error } = await sb.from("fake_profiles").insert(stripped).select("id, username, display_name, full_name, avatar, avatar_url, province, bio, vip_level"));
  }
  if (error) throw error;
  const inserted = (data || []) as any[];

  // Mirror sang profiles (best-effort, không fail toàn bộ nếu thiếu cột).
  // Sanitize username để KHÔNG vi phạm `username_length_check` & các check khác
  // trên public.profiles (chỉ giữ a-z A-Z 0-9 _ . -, độ dài 3..32).
  const sanitizeUsername = (raw: string | null | undefined, id: string): string => {
    const base = (raw ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cleaned = base.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 32);
    if (cleaned.length >= 3) return cleaned;
    return `clone_${id.replace(/-/g, "").slice(0, 10)}`;
  };
  if (inserted.length) {
    const profileRows = inserted.map((r) => ({
      id: r.id,
      username: sanitizeUsername(r.username || r.display_name || r.full_name, r.id),
      full_name: r.display_name || r.full_name || r.username,
      avatar: r.avatar || r.avatar_url || null,
      avatar_url: r.avatar_url || r.avatar || null,
      province: r.province ?? null,
      bio: r.bio ?? null,
      vip_level: r.vip_level ?? 0,
      age: r.age ?? null,
      gender: r.gender ?? null,
      is_seed_account: true,
      is_clone: true,
    }));
    let { error: pErr } = await sb.from("profiles").upsert(profileRows, { onConflict: "id" });
    if (pErr && /column .* does not exist/i.test(pErr.message || "")) {
      const lean = profileRows.map(({ is_clone, age, gender, ...rest }) => rest);
      ({ error: pErr } = await sb.from("profiles").upsert(lean, { onConflict: "id" }));
    }
    if (pErr) console.warn("[fake-profiles] mirror to profiles failed:", pErr.message);
  }

  return inserted.length;
}


/** Soft-delete TOÀN BỘ seed account do admin tạo (KHÔNG xoá messages). */
export async function adminDeleteAllSeedAccounts(): Promise<number> {
  const patch: any = {
    seed_status: "inactive",
    seed_deleted_at: new Date().toISOString(),
    is_active: false,
  };
  let { data, error } = await sb
    .from("fake_profiles")
    .update(patch)
    .eq("created_by_admin", true)
    .select("id");
  if (error && /column .* does not exist/i.test(error.message || "")) {
    // DB chưa migrate seed_status → chỉ set is_active=false (vẫn an toàn cho chat).
    ({ data, error } = await sb
      .from("fake_profiles")
      .update({ is_active: false })
      .eq("created_by_admin", true)
      .select("id"));
  }
  if (error) throw error;
  return (data || []).length;
}
