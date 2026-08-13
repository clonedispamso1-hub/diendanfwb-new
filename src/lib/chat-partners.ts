/**
 * MESSAGE SYSTEM V2 — lưu "danh sách người từng chat".
 *
 * Tin nhắn tự hủy sau 72 giờ, nhưng danh sách cuộc trò chuyện PHẢI còn
 * (giống Messenger mới: mở vào thì trống, có dòng "Bắt đầu cuộc trò chuyện").
 *
 * Nguồn lưu:
 *   1. Bảng public.chat_partners (nếu đã chạy SQL kèm theo) → đồng bộ đa thiết bị.
 *   2. localStorage (fallback, luôn hoạt động).
 * Không bao giờ throw — mọi lỗi đều im lặng để không chặn UI.
 */
import { supabase } from "@/lib/supabase";

const sb = supabase as any;
const key = (meId: string) => `chat.partners::${meId}`;

function readLocal(meId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(meId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(meId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(meId), JSON.stringify(Array.from(new Set(ids)).slice(0, 500)));
  } catch {
    /* ignore */
  }
}

/** Danh sách partnerId từng chat (local + DB nếu có). */
export async function loadKnownPartners(meId: string): Promise<string[]> {
  const local = readLocal(meId);
  let remote: string[] = [];
  try {
    const { data } = await sb
      .from("chat_partners")
      .select("partner_id")
      .eq("user_id", meId)
      .limit(500);
    remote = ((data as any[]) || []).map((r) => r.partner_id).filter(Boolean);
  } catch {
    /* bảng có thể chưa tồn tại */
  }
  const merged = Array.from(new Set([...local, ...remote]));
  if (merged.length !== local.length) writeLocal(meId, merged);
  return merged;
}

/** Ghi nhớ các partner đang có trong danh sách chat. */
export async function rememberPartners(meId: string, partnerIds: string[]): Promise<void> {
  if (!meId || !partnerIds.length) return;
  const local = readLocal(meId);
  const fresh = partnerIds.filter((id) => id && !local.includes(id));
  writeLocal(meId, [...local, ...partnerIds]);
  if (!fresh.length) return;
  try {
    await sb
      .from("chat_partners")
      .upsert(
        fresh.map((partner_id) => ({ user_id: meId, partner_id })),
        { onConflict: "user_id,partner_id" },
      );
  } catch {
    /* bảng có thể chưa tồn tại → chỉ dùng localStorage */
  }
}
