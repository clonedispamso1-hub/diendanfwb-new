import { supabase } from "@/lib/supabase";

export const HONGBAO_MARKER_RE = /^\[\[HONGBAO:([0-9a-fA-F-]{36})\]\]$/;

/** Trả về packet_id nếu content là bao lì xì, ngược lại null. */
export function parseHongbaoMarker(content: string | null | undefined): string | null {
  if (!content) return null;
  const m = content.match(HONGBAO_MARKER_RE);
  return m ? m[1] : null;
}

export interface ChatRedPacket {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  wish: string | null;
  status: "waiting" | "opened" | "expired";
  message_id: string | null;
  created_at: string;
  opened_at: string | null;
}

export async function fetchChatRedPacket(id: string): Promise<ChatRedPacket | null> {
  const { data, error } = await (supabase.from("chat_red_packets" as any) as any)
    .select("id, sender_id, receiver_id, amount, wish, status, message_id, created_at, opened_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[hongbao] fetch failed", error);
    return null;
  }
  return (data as ChatRedPacket) ?? null;
}

export async function sendChatRedPacket(receiverId: string, amount: number, wish: string | null) {
  const { data, error } = await (supabase.rpc as any)("send_chat_red_packet", {
    p_receiver_id: receiverId,
    p_amount: amount,
    p_wish: wish,
  });
  if (error) throw error;
  return data as {
    ok: boolean;
    code?: string;
    message?: string;
    packet_id?: string;
    message_id?: string;
    amount?: number;
    wish?: string | null;
    new_balance?: number;
  };
}

export async function openChatRedPacket(packetId: string) {
  const { data, error } = await (supabase.rpc as any)("open_chat_red_packet", {
    p_packet_id: packetId,
  });
  if (error) throw error;
  return data as {
    ok: boolean;
    code?: string;
    message?: string;
    already_opened?: boolean;
    amount?: number;
    wish?: string | null;
    new_balance?: number;
  };
}
