/**
 * PHASE 3.8 — Bổ sung metadata cho danh sách Nearby.
 *
 * RPC `get_nearby_users` (Phase 3.2 — KHÔNG được sửa) chỉ trả về cột an toàn.
 * Hàm này gọi thêm `profiles` để lấy badge/UI fields cho card mới:
 *   verified, trust_score, vip_level, intent, interests, height, weight, bio, photos, gender.
 *
 * KHÔNG ảnh hưởng SQL hiện có; chỉ là 1 SELECT đơn giản theo `in('id', …)`.
 */

import { supabase } from "@/integrations/supabase/client";

export interface NearbyProfileExtra {
  verified?: boolean | null;
  trust_score?: number | null;
  vip_level?: number | null;
  intent?: string | null;
  interests?: string[] | null;
  height?: number | null;
  weight?: number | null;
  bio?: string | null;
  photos?: string[] | null;
  gender?: string | null;
}

const sb = supabase as unknown as any;

export async function enrichNearbyProfiles(
  ids: string[],
): Promise<Record<string, NearbyProfileExtra>> {
  if (!ids.length) return {};
  const { data, error } = await sb
    .from("profiles")
    .select("id, verified, trust_score, vip_level, intent, interests, height, weight, bio, photos, gender")
    .in("id", ids);
  if (error || !Array.isArray(data)) return {};
  const map: Record<string, NearbyProfileExtra> = {};
  for (const row of data) map[row.id] = row;
  return map;
}

export const INTENT_LABELS: Record<string, { label: string; emoji: string; tone: string }> = {
  fwb:     { label: "FWB",        emoji: "🔥", tone: "bg-rose-500/10 text-rose-500" },
  ons:     { label: "ONS",        emoji: "💋", tone: "bg-pink-500/10 text-pink-500" },
  love:    { label: "Tình yêu",   emoji: "💖", tone: "bg-rose-400/10 text-rose-400" },
  dating:  { label: "Hẹn hò",     emoji: "💘", tone: "bg-fuchsia-500/10 text-fuchsia-500" },
  serious: { label: "Nghiêm túc", emoji: "💍", tone: "bg-amber-500/10 text-amber-600" },
};
