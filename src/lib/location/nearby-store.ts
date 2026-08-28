/**
 * PHASE 3.2 — Tìm quanh đây.
 *
 * Wrapper gọi RPC `public.get_nearby_users`. Server chỉ trả về metadata an
 * toàn (KHÔNG có lat/lng). Frontend không tự tính khoảng cách — luôn dùng
 * `distance_label` đã được làm tròn từ server.
 */

import { supabase } from "@/lib/supabase";

const VIRTUAL_TABLE = "nicktuongtac";

export type NearbySort = "online" | "updated" | "distance";

export interface NearbyUser {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  age: number | null;
  province: string | null;
  city: string | null;
  is_online: boolean;
  last_seen: string | null;
  location_updated: string | null;
  distance_km: number | null;
  distance_bucket: string;
  distance_label: string;
  /** Nick ảo do admin tạo trong nicktuongtac → khoá Story/Bài đăng + VIP intercept. */
  is_clone?: boolean;
  is_virtual?: boolean;
  /** Bio ngắn để mini-profile hiển thị fallback khi không có row profiles. */
  bio?: string | null;
  vip_level?: number | null;
  gender?: string | null;
}

export interface FetchNearbyParams {
  radiusKm: number | null; // null = toàn quốc
  sort: NearbySort;
  limit?: number;
}

function missingColumnName(error: any): string | null {
  const msg = error?.message || "";
  return msg.match(/column "?([a-zA-Z_]+)"? .* does not exist/i)?.[1]
    || msg.match(/Could not find the '([a-zA-Z_]+)' column/i)?.[1]
    || null;
}

function normalizeProvince(value?: string | null): string {
  return (value ?? "").toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isFlexibleProvince(value?: string | null): boolean {
  const normalized = normalizeProvince(value);
  return !normalized || normalized === "linh hoat" || normalized === "flexible" || normalized === "toan quoc";
}

async function loadNearbyVirtualRows(myProvince: string | null, limit: number): Promise<NearbyUser[]> {
  let columns = [
    "id", "username", "display_name", "full_name", "avatar", "avatar_url", "age",
    "province", "location", "bio", "vip_level", "is_active", "status", "created_at",
    "gender", "is_online", "trust_score",
  ];

  let rows: any[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await (supabase.from(VIRTUAL_TABLE as any) as any)
      .select(columns.join(", "))
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, 120));
    if (!error) {
      rows = (data ?? []) as any[];
      break;
    }
    const missing = missingColumnName(error);
    if (missing && columns.includes(missing)) {
      columns = columns.filter((c) => c !== missing);
      continue;
    }
    console.warn("[nearby] load nicktuongtac error:", error.message || error);
    return [];
  }

  const myProvKey = normalizeProvince(myProvince);
  return rows
    .filter((p: any) => p?.id)
    .filter((p: any) => p.is_active !== false && p.status !== "inactive" && p.status !== "deleted")
    .filter((p: any) => {
      if (!myProvKey) return true;
      const rowProvince = p.province ?? p.location ?? null;
      return normalizeProvince(rowProvince) === myProvKey || isFlexibleProvince(rowProvince);
    })
    .slice(0, limit)
    .map((p: any) => {
      const rowProvince = p.province ?? p.location ?? null;
      const displayProvince = isFlexibleProvince(rowProvince) ? (myProvince ?? null) : rowProvince;
      return {
        id: p.id,
        full_name: p.display_name ?? p.full_name ?? p.username ?? null,
        username: p.username ?? null,
        avatar: p.avatar ?? p.avatar_url ?? null,
        age: p.age ?? null,
        province: displayProvince ?? null,
        city: null,
        is_online: p.is_online ?? true,
        last_seen: null,
        location_updated: p.created_at ?? null,
        distance_km: null,
        distance_bucket: "city",
        distance_label: displayProvince || "Cùng khu vực",
        is_clone: true,
        is_virtual: true,
        bio: p.bio ?? null,
        vip_level: p.vip_level ?? 0,
        gender: p.gender ?? null,
      } satisfies NearbyUser;
    });
}

function mergeNearbyRows(realRows: NearbyUser[], virtualRows: NearbyUser[], limit: number, myId: string | null): NearbyUser[] {
  const byId = new Map<string, NearbyUser>();
  const push = (row: NearbyUser | undefined) => {
    if (!row?.id || row.id === myId || byId.has(row.id)) return;
    byId.set(row.id, row);
  };
  const max = Math.max(realRows.length, virtualRows.length);
  for (let i = 0; i < max; i++) {
    push(virtualRows[i]);
    push(realRows[i]);
  }
  return Array.from(byId.values()).slice(0, limit);
}

export async function fetchNearbyUsers(
  params: FetchNearbyParams,
): Promise<{ data: NearbyUser[]; error: string | null }> {
  // 🔒 Restriction gate — tài khoản bị hạn chế "nearby" không được quét quanh đây.
  {
    const { ensureAllowed } = await import("@/lib/restriction-guard");
    if (!(await ensureAllowed("nearby"))) {
      return { data: [], error: "RESTRICTED:nearby" };
    }
  }
  const limit = params.limit ?? 60;
  let myId: string | null = null;
  let myProvince: string | null = null;
  try {
    const { data: meRow } = await supabase.auth.getUser();
    myId = meRow?.user?.id ?? null;
    if (myId) {
      const { data: meProf } = await (supabase.from("profiles") as any)
        .select("province, city, location")
        .eq("id", myId)
        .maybeSingle();
      myProvince = meProf?.province ?? meProf?.city ?? meProf?.location ?? null;
    }
  } catch { /* keep anonymous-safe fallback */ }

  const { data, error } = await supabase.rpc("get_nearby_users", {
    p_radius_km: params.radiusKm,
    p_sort: params.sort,
    p_limit: limit,
  });
  const rows = (data ?? []) as NearbyUser[];
  if (!error && rows.length > 0) {
    const virtuals = await loadNearbyVirtualRows(myProvince, limit);
    return { data: mergeNearbyRows(rows, virtuals, limit, myId), error: null };
  }
  // FALLBACK (bypass geolocation): query trực tiếp profiles theo Tỉnh/Thành
  // mà user đã chọn khi đăng ký.
  try {
    let q: any = (supabase.from("profiles") as any)
      .select("id, full_name, username, avatar, age, province, city, is_online, last_seen, created_at")
      .neq("id", myId ?? "")
      .eq("is_seed_account", true)
      .limit(limit);
    if (myProvince) q = q.eq("province", myProvince);
    const { data: profs, error: pErr } = await q;
    if (pErr) return { data: [], error: pErr.message };
    const mapped: NearbyUser[] = (profs ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      username: p.username ?? null,
      avatar: p.avatar ?? null,
      age: p.age ?? null,
      province: p.province ?? null,
      city: p.city ?? null,
      is_online: Boolean(p.is_online),
      last_seen: p.last_seen ?? null,
      location_updated: p.created_at ?? null,
      distance_km: null,
      distance_bucket: "city",
      distance_label: p.province || p.city || "Cùng khu vực",
      is_clone: false,
    }));

    const virtuals = await loadNearbyVirtualRows(myProvince, limit);
    // Trộn clones `nicktuongtac` xen kẽ vào danh sách thật để feed sống động hơn.
    const merged = mergeNearbyRows(mapped, virtuals, limit, myId);
    return { data: merged, error: null };
  } catch (e: any) {
    return { data: [], error: e?.message ?? "Không tải được danh sách." };
  }
}

export const RADIUS_PRESETS: { label: string; value: number | null }[] = [
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "50 km", value: 50 },
  { label: "100 km", value: 100 },
  { label: "Toàn quốc", value: null },
];

export const SORT_PRESETS: { label: string; value: NearbySort }[] = [
  { label: "Gần nhất", value: "distance" },
  { label: "Mới hoạt động", value: "updated" },
  { label: "Online", value: "online" },
];