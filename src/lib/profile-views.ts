/* ============================================================
   Tương tác trong ngày — "Đã yêu thích" + "Ai xem hồ sơ"
   ------------------------------------------------------------
   Nguyên tắc hiệu năng:
   - Không realtime, không polling, không websocket mới.
   - Chỉ query khi người dùng mở tab.
   - Pagination 20 item, chỉ SELECT đúng field cần.
   - Dữ liệu "ai xem hồ sơ" chỉ tồn tại trong ngày.
   ============================================================ */

import { supabase } from "@/lib/supabase";

export const PEOPLE_PAGE_SIZE = 20;

export interface PersonRow {
  id: string;
  name: string;
  avatar: string | null;
  age: number | null;
  area: string | null;
  /** thời điểm yêu thích / thời điểm xem */
  at: string | null;
}

const PROFILE_MINI_COLS = "id, full_name, avatar, age, province, location";

function todayStr(): string {
  // Ngày theo giờ VN — khớp với default của cột view_date trong SQL.
  const now = new Date();
  const vn = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60_000);
  const m = `${vn.getMonth() + 1}`.padStart(2, "0");
  const d = `${vn.getDate()}`.padStart(2, "0");
  return `${vn.getFullYear()}-${m}-${d}`;
}

async function loadProfiles(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_MINI_COLS)
    .in("id", ids);
  for (const p of (data as any[]) || []) map.set(p.id, p);
  return map;
}

function toPerson(p: any, at: string | null): PersonRow {
  return {
    id: p?.id,
    name: p?.full_name || "Người dùng",
    avatar: p?.avatar ?? null,
    age: typeof p?.age === "number" ? p.age : null,
    area: p?.province || p?.location || null,
    at,
  };
}

/** Danh sách tài khoản tôi đã bấm Yêu thích (bảng `follows` cũ). */
export async function fetchMyFavorites(meId: string, page: number): Promise<PersonRow[]> {
  const from = page * PEOPLE_PAGE_SIZE;
  const { data, error } = await supabase
    .from("follows")
    .select("following_id, created_at")
    .eq("follower_id", meId)
    .order("created_at", { ascending: false })
    .range(from, from + PEOPLE_PAGE_SIZE - 1);
  if (error || !data) return [];

  const rows = data as any[];
  const profiles = await loadProfiles(rows.map((r) => r.following_id).filter(Boolean));
  return rows
    .map((r) => {
      const p = profiles.get(r.following_id);
      return p ? toPerson(p, r.created_at ?? null) : null;
    })
    .filter(Boolean) as PersonRow[];
}

/** Những người đã mở hồ sơ của tôi HÔM NAY (mới nhất trước). */
export async function fetchTodayViewers(meId: string, page: number): Promise<PersonRow[]> {
  const from = page * PEOPLE_PAGE_SIZE;
  const { data, error } = await supabase
    .from("profile_views_today")
    .select("viewer_id, viewed_at")
    .eq("viewed_id", meId)
    .eq("view_date", todayStr())
    .order("viewed_at", { ascending: false })
    .range(from, from + PEOPLE_PAGE_SIZE - 1);
  if (error || !data) return [];

  const rows = data as any[];
  const profiles = await loadProfiles(rows.map((r) => r.viewer_id).filter(Boolean));
  return rows
    .map((r) => {
      const p = profiles.get(r.viewer_id);
      return p ? toPerson(p, r.viewed_at ?? null) : null;
    })
    .filter(Boolean) as PersonRow[];
}

/* ---------- Ghi lượt xem (1 lượt / người / ngày) ---------- */

const seenKey = (meId: string, target: string) => `pv.sent::${todayStr()}::${meId}::${target}`;

export async function recordProfileView(meId?: string | null, targetId?: string | null) {
  if (!meId || !targetId || meId === targetId) return; // không tính lượt xem của chính mình
  try {
    const k = seenKey(meId, targetId);
    if (sessionStorage.getItem(k)) return; // đã ghi trong phiên này → khỏi gọi DB
    sessionStorage.setItem(k, "1");
    await supabase.rpc("record_profile_view" as any, { p_viewed: targetId });
  } catch {
    /* im lặng — không được ảnh hưởng UI */
  }
}

/* ---------- Chấm đỏ nhỏ ---------- */

const dotKey = (meId: string) => `pv.seenAt::${meId}`;

/** Có người mới xem hồ sơ hôm nay chưa xem? (1 query cực nhẹ, chỉ khi mở app) */
export async function hasNewViewers(meId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("profile_views_today")
      .select("viewed_at")
      .eq("viewed_id", meId)
      .eq("view_date", todayStr())
      .order("viewed_at", { ascending: false })
      .limit(1);
    const latest = (data as any[])?.[0]?.viewed_at as string | undefined;
    if (!latest) return false;
    const seen = localStorage.getItem(dotKey(meId));
    return !seen || new Date(latest).getTime() > new Date(seen).getTime();
  } catch {
    return false;
  }
}

export function markViewersSeen(meId: string) {
  try {
    localStorage.setItem(dotKey(meId), new Date().toISOString());
  } catch {
    /* noop */
  }
}

/* ---------- Format thời gian ---------- */

export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  const d = new Date(t);
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
