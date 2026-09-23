/**
 * 🔗 Cầu nối phiên đăng nhập: Supabase #1 (auth chính) → Supabase #3 (chat/feed/logs).
 *
 * - Không đổi UI, không đổi logic Chat: chỉ gắn session thật của #3 vào client `logs`
 *   để `auth.uid()` hoạt động trên #3 (chuẩn bị cho bước siết RLS sau này).
 * - Mọi lỗi đều nuốt im lặng: phiên #1 và chat hiện tại (anon bridge) không bị ảnh hưởng.
 */
import { db3, supabase } from "@/lib/db/router";
import { grantChatSessionFn } from "@/lib/chat-session.functions";

let inflight: Promise<boolean> | null = null;
let lastOkUserId: string | null = null;

async function currentSb3UserId(): Promise<string | null> {
  try {
    const { data } = await db3().auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function run(uid: string, accessToken: string): Promise<boolean> {
  try {
    const already = await currentSb3UserId();
    if (already === uid) {
      lastOkUserId = uid;
      return true;
    }
    if (already && already !== uid) {
      await db3().auth.signOut().catch(() => {});
    }

    const grant = await grantChatSessionFn({ data: { accessToken } });
    if (!grant?.ok || !grant.tokenHash) {
      console.warn("[chat-session] không cấp được phiên #3:", grant?.reason);
      return false;
    }

    const { data, error } = await db3().auth.verifyOtp({
      type: "magiclink",
      token_hash: grant.tokenHash,
    });
    if (error || !data.session) {
      console.warn("[chat-session] verifyOtp #3 thất bại:", error?.message);
      return false;
    }

    try {
      (db3() as any).realtime?.setAuth?.(data.session.access_token);
    } catch { /* ignore */ }

    lastOkUserId = uid;
    return true;
  } catch (err) {
    console.warn("[chat-session] lỗi ngoài dự kiến:", err);
    return false;
  }
}

/** Đảm bảo client #3 có session của đúng user #1 đang đăng nhập. */
export async function ensureChatSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user?.id || !session.access_token) return false;
      if (lastOkUserId === session.user.id && (await currentSb3UserId()) === session.user.id) {
        return true;
      }
      return await run(session.user.id, session.access_token);
    } catch {
      return false;
    } finally {
      // giải phóng ở tick sau để gộp các lời gọi song song
      setTimeout(() => { inflight = null; }, 0);
    }
  })();

  return inflight;
}

/** Đăng xuất phiên #3 (gọi kèm khi logout #1). */
export async function clearChatSession(): Promise<void> {
  lastOkUserId = null;
  try {
    await db3().auth.signOut();
  } catch { /* ignore */ }
}
