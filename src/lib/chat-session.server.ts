/**
 * 🔐 Server-only: cấp phiên Supabase #3 cho user đã đăng nhập ở Supabase #1.
 *
 * Nguyên tắc:
 * - SB3_SERVICE_ROLE_KEY chỉ tồn tại ở file này (server). KHÔNG bao giờ trả về client.
 * - Không mint JWT thủ công, không đụng JWT signing key: dùng Admin API của #3
 *   (`generate_link`) để lấy `token_hash` một lần, client đổi lấy session thật.
 * - Provision user #3 với ĐÚNG UUID của user #1 → auth.uid() khớp sender_id sẵn có.
 * - Không sửa RLS/GRANT/schema, không migrate, không xóa dữ liệu.
 */
import process from "node:process";

const SB1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const SB1_PUBLISHABLE = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

export interface ChatSessionGrant {
  ok: boolean;
  /** token_hash dùng cho verifyOtp trên client (một lần, ngắn hạn). */
  tokenHash?: string;
  userId?: string;
  reason?: string;
}

function sb3Key(): string {
  const key = (process.env["SB3_SERVICE_ROLE_KEY"] || "").trim();
  if (!key) throw new Error("missing_sb3_service_role_key");
  return key;
}

function adminHeaders() {
  const key = sb3Key();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Email dự phòng khi user #1 không có email dùng được / email đã bị UUID khác chiếm. */
const fallbackEmail = (uid: string) => `${uid}@chat.local`;

/** 1. Xác thực access token của Supabase #1 (hỏi thẳng Auth #1, không tự verify chữ ký). */
async function verifySb1User(accessToken: string): Promise<{ id: string; email: string | null } | null> {
  const res = await fetch(`${SB1_URL}/auth/v1/user`, {
    headers: { apikey: SB1_PUBLISHABLE, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string | null };
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? null };
}

/** 2a. User #3 đã tồn tại với đúng UUID? */
async function getSb3UserById(uid: string): Promise<{ id: string; email: string | null } | null> {
  const res = await fetch(`${SB3_URL}/auth/v1/admin/users/${uid}`, { headers: adminHeaders() });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string | null };
  return user?.id ? { id: user.id, email: user.email ?? null } : null;
}

/** 2b. Email đã bị user #3 khác (UUID khác) chiếm chưa? */
async function findSb3UserByEmail(email: string): Promise<{ id: string } | null> {
  const url = `${SB3_URL}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: adminHeaders() });
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: Array<{ id: string; email?: string | null }> };
  const hit = (body.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  return hit ? { id: hit.id } : null;
}

/** 2c. Tạo user #3 với đúng UUID của #1 (idempotent theo UUID). */
async function createSb3User(uid: string, email: string): Promise<boolean> {
  const res = await fetch(`${SB3_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      id: uid,
      email,
      email_confirm: true,
      user_metadata: { source: "sb1-sync", sb1_user_id: uid },
    }),
  });
  if (res.ok) return true;
  // Đã tồn tại (race) → coi như thành công nếu UUID khớp.
  const existing = await getSb3UserById(uid);
  return Boolean(existing);
}

/** 3. Đổi user #3 lấy token_hash một lần (magiclink) — không gửi email. */
async function generateTokenHash(email: string): Promise<string | null> {
  const res = await fetch(`${SB3_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as
    | { hashed_token?: string; properties?: { hashed_token?: string } }
    | null;
  return body?.properties?.hashed_token || body?.hashed_token || null;
}

/**
 * Provision (nếu cần) + cấp token_hash cho phiên Supabase #3.
 * Mọi lỗi đều trả về `{ ok: false }` — KHÔNG ném ra ngoài để không ảnh hưởng phiên #1.
 */
export async function grantChatSession(accessToken: string): Promise<ChatSessionGrant> {
  try {
    const user = await verifySb1User(accessToken);
    if (!user) return { ok: false, reason: "invalid_sb1_token" };

    const existing = await getSb3UserById(user.id);
    let email = existing?.email || null;

    if (!email) {
      // Ưu tiên email thật của #1; nếu email đó đã thuộc UUID khác → dùng email dẫn xuất từ UUID.
      const preferred = (user.email || "").trim().toLowerCase();
      if (preferred) {
        const owner = await findSb3UserByEmail(preferred);
        email = !owner || owner.id === user.id ? preferred : fallbackEmail(user.id);
      } else {
        email = fallbackEmail(user.id);
      }
      if (!existing) {
        const created = await createSb3User(user.id, email);
        if (!created) return { ok: false, reason: "provision_failed" };
      }
    }

    const tokenHash = await generateTokenHash(email);
    if (!tokenHash) return { ok: false, reason: "grant_failed" };
    return { ok: true, tokenHash, userId: user.id };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "unknown_error" };
  }
}
