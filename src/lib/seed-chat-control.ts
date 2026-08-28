/**
 * Seed Chat Control — helpers cho Admin reply hộ nick ảo realtime.
 *
 * Dữ liệu nằm trong bảng `messages` (schema: sender_id, receiver_id,
 * content, created_at). Khi admin reply hộ seed:
 *   sender_id   = seed_id  (UUID của nick ảo)
 *   receiver_id = user_id  (UUID của user thật)
 *
 * Realtime: subscribe channel postgres_changes trên `messages`.
 */
import { supabase } from "@/lib/supabase";
import { chatDb } from "@/lib/chat-db";

const sb = supabase as any;

export interface SeedAccount {
  id: string;
  display_name: string;
  username: string | null;
  avatar: string | null;
  province: string | null;
  seed_status: "active" | "inactive";
  seed_deleted_at: string | null;
  source_table: "profiles" | "fake_profiles";
}

export interface SeedConversation {
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  last_sender_is_user: boolean;
}

export interface SeedMessage {
  id: string | number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at?: string | null;
}

/** Liệt kê tất cả seed accounts (gộp profiles.is_virtual + fake_profiles). */
export async function listAllSeedAccounts(): Promise<SeedAccount[]> {
  const { data, error } = await sb
    .from("v_seed_accounts")
    .select("id,display_name,username,avatar,province,seed_status,seed_deleted_at,source_table")
    .order("display_name", { ascending: true }).limit(100);
  if (error) {
    // Fallback: nếu view chưa được tạo, gộp tay từ 2 bảng.
    const [a, b] = await Promise.all([
      sb.from("profiles")
        .select("id,full_name,username,avatar,province,seed_status,seed_deleted_at")
        .eq("is_virtual", true).limit(100),
      sb.from("fake_profiles")
        .select("id,display_name,full_name,username,avatar,avatar_url,province,seed_status,seed_deleted_at,is_active").limit(100),
    ]);
    const list: SeedAccount[] = [
      ...((a.data || []) as any[]).map((r) => ({
        id: r.id,
        display_name: r.full_name || r.username || "Nick ảo",
        username: r.username,
        avatar: r.avatar,
        province: r.province,
        seed_status: r.seed_status || "active",
        seed_deleted_at: r.seed_deleted_at,
        source_table: "profiles" as const,
      })),
      ...((b.data || []) as any[]).map((r) => ({
        id: r.id,
        display_name: r.display_name || r.full_name || r.username || "Seed",
        username: r.username,
        avatar: r.avatar || r.avatar_url,
        province: r.province,
        seed_status: r.seed_status || "active",
        seed_deleted_at: r.seed_deleted_at,
        source_table: "fake_profiles" as const,
      })),
    ];
    return list;
  }
  return (data || []) as SeedAccount[];
}

/** Lấy danh sách user đang chat với một seed (mới nhất trước). */
export async function listConversationsForSeed(seedId: string): Promise<SeedConversation[]> {
  // Lấy tất cả messages liên quan (user → seed hoặc seed → user)
  const { data, error } = await chatDb()
    .from("messages")
    .select("id,sender_id,receiver_id,content,created_at,read_at")
    .or(`sender_id.eq.${seedId},receiver_id.eq.${seedId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const byUser = new Map<string, SeedConversation & { _ids: string[] }>();
  for (const m of (data || []) as SeedMessage[]) {
    const otherId = m.sender_id === seedId ? m.receiver_id : m.sender_id;
    if (otherId === seedId) continue;
    const existing = byUser.get(otherId);
    if (!existing) {
      byUser.set(otherId, {
        user_id: otherId,
        user_name: "",
        user_avatar: null,
        last_message: m.content,
        last_message_at: m.created_at,
        unread_count: 0,
        last_sender_is_user: m.sender_id !== seedId,
        _ids: [String(m.id)],
      });
    } else {
      existing._ids.push(String(m.id));
    }
    const cur = byUser.get(otherId)!;
    // unread = tin user gửi nhưng seed (admin) chưa đọc
    if (m.sender_id !== seedId && !m.read_at) cur.unread_count++;
  }

  // Fetch profile info cho từng user
  const userIds = Array.from(byUser.keys());
  if (userIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id,full_name,username,avatar")
      .in("id", userIds);
    for (const p of (profiles || []) as any[]) {
      const c = byUser.get(p.id);
      if (c) {
        c.user_name = p.full_name || p.username || "User";
        c.user_avatar = p.avatar;
      }
    }
  }

  return Array.from(byUser.values())
    .map(({ _ids, ...rest }) => rest)
    .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
}

/** Lấy lịch sử chat giữa seed và user. */
export async function loadSeedConversationMessages(
  seedId: string,
  userId: string,
  limit = 200,
): Promise<SeedMessage[]> {
  const { data, error } = await chatDb()
    .from("messages")
    .select("id,sender_id,receiver_id,content,created_at,read_at")
    .or(
      `and(sender_id.eq.${seedId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${seedId})`,
    )
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SeedMessage[];
}

/** Admin gửi tin "thay mặt" seed → user. */
export async function adminReplyAsSeed(
  seedId: string,
  userId: string,
  content: string,
): Promise<SeedMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Tin nhắn rỗng");

  const payload = {
    sender_id: seedId,
    receiver_id: userId,
    content: trimmed,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await chatDb()
    .from("messages")
    .insert(payload)
    .select("id,sender_id,receiver_id,content,created_at,read_at")
    .single();
  if (error) throw error;

  // Cập nhật last_admin_reply_at nếu seed là fake_profile
  await sb.from("fake_profiles")
    .update({ last_admin_reply_at: new Date().toISOString() })
    .eq("id", seedId);

  return data as SeedMessage;
}

/** Đánh dấu tất cả tin user gửi cho seed là "đã đọc" bởi admin. */
export async function markSeedConversationRead(
  seedId: string,
  userId: string,
): Promise<void> {
  await chatDb()
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", userId)
    .eq("receiver_id", seedId)
    .is("read_at", null);
}

/** Bật/tắt trạng thái "online" của seed (admin control). */
export async function setSeedOnline(seedId: string, online: boolean): Promise<void> {
  await sb.from("fake_profiles").update({ admin_online: online }).eq("id", seedId);
}

/** Soft-delete seed account. KHÔNG xoá messages. */
export async function softDeleteSeedAccount(seedId: string): Promise<void> {
  const patch = {
    seed_status: "inactive",
    seed_deleted_at: new Date().toISOString(),
  };
  // Thử update cả 2 bảng (chỉ 1 cái trúng)
  await sb.from("fake_profiles").update({ ...patch, is_active: false }).eq("id", seedId);
  await sb.from("profiles").update(patch).eq("id", seedId).eq("is_virtual", true);
}

/** Khôi phục seed account đã ngừng hoạt động. */
export async function restoreSeedAccount(seedId: string): Promise<void> {
  const patch = { seed_status: "active", seed_deleted_at: null };
  await sb.from("fake_profiles").update({ ...patch, is_active: true }).eq("id", seedId);
  await sb.from("profiles").update(patch).eq("id", seedId).eq("is_virtual", true);
}

/** Subscribe realtime tin nhắn liên quan tới seed (admin panel). */
export function subscribeSeedMessages(
  seedId: string,
  onNew: (msg: SeedMessage) => void,
): () => void {
  const ch = sb
    .channel(`seed-msg:${seedId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${seedId}` },
      (payload: any) => onNew(payload.new as SeedMessage),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${seedId}` },
      (payload: any) => onNew(payload.new as SeedMessage),
    )
    .subscribe();
  return () => { try { sb.removeChannel(ch); } catch { /* */ } };
}

/** Kiểm tra một user_id có phải seed account đang inactive không. */
export async function getSeedStatus(
  userId: string,
): Promise<{ is_seed: boolean; status: "active" | "inactive" } | null> {
  // Thử fake_profiles trước (FWB nearby)
  const { data: f } = await sb
    .from("fake_profiles")
    .select("id,seed_status")
    .eq("id", userId)
    .maybeSingle();
  if (f) return { is_seed: true, status: (f.seed_status || "active") as any };

  // Thử profiles.is_virtual
  const { data: p } = await sb
    .from("profiles")
    .select("id,is_virtual,seed_status")
    .eq("id", userId)
    .maybeSingle();
  if (p && (p as any).is_virtual) {
    return { is_seed: true, status: ((p as any).seed_status || "active") as any };
  }
  return null;
}
