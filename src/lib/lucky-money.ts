// Lucky Money (Lì Xì) — client helpers wrapping post-attached red_packet RPCs.
// Server-side truth lives in docs/sql/2026-07-26_lucky_money_v2_and_post_contact.sql.
import { supabase } from "@/lib/supabase";

export interface LuckyMoneyPacket {
  id: string;
  post_id: string;
  sender_id: string;
  total_amount: number;
  remaining_amount: number;
  packet_count: number;
  remaining_count: number;
  status: "active" | "depleted" | "expired" | string;
  expires_at: string | null;
  min_reward: number | null;
  max_reward: number | null;
  created_at: string;
}

export interface LuckyMoneyClaim {
  id: string;
  packet_id: string;
  user_id: string;
  amount: number;
  claimed_at: string;
  profiles?: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export async function fetchPacketForPost(postId: string) {
  const { data, error } = await (supabase as any)
    .from("red_packets")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();
  if (error) throw error;
  return data as LuckyMoneyPacket | null;
}

export async function fetchClaimsForPacket(packetId: string) {
  const { data, error } = await (supabase as any)
    .from("red_packet_claims")
    .select("id, packet_id, user_id, amount, claimed_at, profiles:profiles(id, display_name, avatar_url)")
    .eq("packet_id", packetId)
    .order("claimed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LuckyMoneyClaim[];
}

export async function fetchMyClaim(packetId: string, userId: string) {
  const { data, error } = await (supabase as any)
    .from("red_packet_claims")
    .select("id, amount")
    .eq("packet_id", packetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; amount: number } | null;
}

export async function createPostLuckyMoney(args: {
  postId: string;
  total: number;
  maxRecipients: number;
  minReward: number;
  maxReward: number;
  expirationSeconds: number;
}) {
  const { data, error } = await (supabase as any).rpc("create_post_lucky_money", {
    p_post_id: args.postId,
    p_total: args.total,
    p_max_recipients: args.maxRecipients,
    p_min_reward: args.minReward,
    p_max_reward: args.maxReward,
    p_expiration_seconds: args.expirationSeconds,
  });
  if (error) throw error;
  return data as { ok: boolean; packet_id: string; total: number; packs: number; expires_at: string };
}

export async function claimPostLuckyMoney(postId: string) {
  const { data, error } = await (supabase as any).rpc("claim_post_lucky_money", {
    p_post_id: postId,
  });
  if (error) throw error;
  return data as { ok: boolean; amount: number; packet_id: string };
}

export const EXPIRATION_PRESETS: { label: string; seconds: number }[] = [
  { label: "30 phút", seconds: 30 * 60 },
  { label: "1 giờ", seconds: 60 * 60 },
  { label: "3 giờ", seconds: 3 * 60 * 60 },
  { label: "24 giờ", seconds: 24 * 60 * 60 },
];

export function formatVnd(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("vi-VN") + "đ";
}
