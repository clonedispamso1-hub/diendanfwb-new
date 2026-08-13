// =====================================================================
// PHASE 3.4 — Quan tâm / Match (server-backed)
// =====================================================================
// - Lưu lên Supabase: bảng `nearby_interests` (mới hoàn toàn).
// - Toggle qua RPC `toggle_nearby_interest` — server tự chống spam 100/ngày
//   và phát hiện MATCH 2 chiều.
// - Cache cục bộ + pub/sub để UI tức thì (không reload).
//
// KHÔNG đụng: connection_requests, fwb_likes, posts, chats, gem, vip,
// user_locations, location_ready.
// =====================================================================
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as any;
const KEY = "nearby:interest:v1";

let cachedSet: Set<string> = new Set();
let cachedSerialized = "";
let hydrated = false;
let inflight: Promise<void> | null = null;

function persist(set: Set<string>) {
  cachedSet = set;
  cachedSerialized = JSON.stringify([...set]);
  hydrated = true;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, cachedSerialized); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent("nearby:interest-change"));
  }
}

function readFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY) || "[]";
    const arr = JSON.parse(raw);
    return new Set<string>(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

/** Tải snapshot từ server (1 lần khi vào trang Nearby). */
export async function hydrateNearbyInterests(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    // optimistic from storage
    if (!hydrated) {
      cachedSet = readFromStorage();
      cachedSerialized = JSON.stringify([...cachedSet]);
      hydrated = true;
    }
    try {
      const { data, error } = await sb.rpc("list_nearby_interests");
      if (!error && Array.isArray(data)) {
        const next = new Set<string>(data.map((r: any) => r.to_user as string));
        persist(next);
      }
    } catch { /* offline ok */ }
  })();
  try { await inflight; } finally { inflight = null; }
}

export function isInterested(targetId: string): boolean {
  if (!hydrated && typeof window !== "undefined") {
    cachedSet = readFromStorage();
    cachedSerialized = JSON.stringify([...cachedSet]);
    hydrated = true;
  }
  return cachedSet.has(targetId);
}

export function getInterestSet(): Set<string> { return cachedSet; }
const EMPTY: Set<string> = new Set();
export function getInterestSetServer(): Set<string> { return EMPTY; }

export function subscribeInterest(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener("nearby:interest-change", h);
  return () => window.removeEventListener("nearby:interest-change", h);
}

export interface ToggleResult {
  liked: boolean;
  matched: boolean;
  rateLimited?: boolean;
  error?: string;
}

/** Toggle ❤️ — optimistic, rollback nếu server lỗi. */
export async function toggleNearbyInterest(targetId: string): Promise<ToggleResult> {
  const had = cachedSet.has(targetId);
  // Optimistic
  const optimistic = new Set(cachedSet);
  if (had) optimistic.delete(targetId); else optimistic.add(targetId);
  persist(optimistic);

  try {
    const { data, error } = await sb.rpc("toggle_nearby_interest", { _target: targetId });
    if (error) {
      // rollback
      persist(new Set(cachedSet.has(targetId) ? [...cachedSet].filter((x) => x !== targetId) : [...cachedSet, targetId]));
      const msg = String(error.message || "");
      const rate = /limit|spam|100/i.test(msg);
      return { liked: had, matched: false, rateLimited: rate, error: msg };
    }
    // Sync với server result
    const liked = !!data?.liked;
    const next = new Set(cachedSet);
    if (liked) next.add(targetId); else next.delete(targetId);
    persist(next);
    return { liked, matched: !!data?.matched };
  } catch (e: any) {
    return { liked: had, matched: false, error: String(e?.message || e) };
  }
}

// Danh sách MATCH 2 chiều ----------------------------------------------
export interface NearbyMatchRow {
  other_id: string;
  matched_at: string;
}

export async function listNearbyMatches(): Promise<NearbyMatchRow[]> {
  try {
    const { data, error } = await sb.rpc("list_nearby_matches");
    if (error || !Array.isArray(data)) return [];
    return data as NearbyMatchRow[];
  } catch { return []; }
}

// Thông báo riêng cho Nearby -------------------------------------------
export interface NearbyNotificationRow {
  id: string;
  user_id: string;
  from_user: string;
  kind: "interest" | "match";
  is_read: boolean;
  created_at: string;
}

export async function listNearbyNotifications(limit = 30): Promise<NearbyNotificationRow[]> {
  try {
    const { data, error } = await sb
      .from("nearby_match_notifications")
      .select("id, user_id, from_user, kind, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as NearbyNotificationRow[];
  } catch { return []; }
}

export async function markNearbyNotificationRead(id: string): Promise<void> {
  try { await sb.from("nearby_match_notifications").update({ is_read: true }).eq("id", id); }
  catch { /* noop */ }
}
