/**
 * 🔐 Server-only: gắn link Facebook / Zalo vào bài viết.
 *
 * Nguyên tắc bảo mật:
 *  - Client KHÔNG bao giờ được tự ghi posts.facebook_url / posts.zalo_url nữa.
 *  - Server tự xác thực access token của Supabase #1 (hỏi thẳng Auth #1),
 *    tự đọc profiles (is_admin / role / account_source) bằng chính token đó,
 *    rồi mới ghi 2 cột này trên Supabase #3 bằng service role.
 *  - User thường dù gửi payload facebook_url / zalo_url cũng bị từ chối.
 *  - Không đổi schema, không migration, không đụng RLS hiện tại.
 */
import process from "node:process";
import { canUseContactLinks } from "@/lib/post-contact-access";
import { normalizeFacebookUrl, normalizeZaloPhone, zaloHrefFromPhone } from "@/lib/contact-validation";

const SB1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const SB1_PUBLISHABLE = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

export interface AttachContactLinksResult {
  ok: boolean;
  applied?: { facebook_url: string | null; zalo_url: string | null };
  reason?: string;
}

function sb3Key(): string {
  const key = (process.env["SB3_SERVICE_ROLE_KEY"] || "").trim();
  if (!key) throw new Error("missing_sb3_service_role_key");
  return key;
}

/** Xác thực access token #1 → user id (không tự verify chữ ký). */
async function verifySb1User(accessToken: string): Promise<string | null> {
  const res = await fetch(`${SB1_URL}/auth/v1/user`, {
    headers: { apikey: SB1_PUBLISHABLE, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user?.id ?? null;
}

/** Đọc cờ quyền từ profiles #1 bằng chính token của user (RLS self-read). */
async function readProfileFlags(uid: string, accessToken: string) {
  const url = `${SB1_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=is_admin,role,account_source`;
  const res = await fetch(url, {
    headers: { apikey: SB1_PUBLISHABLE, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows?.[0] ?? null;
}

export async function attachPostContactLinks(input: {
  accessToken: string;
  postId: string;
  facebookUrl?: string | null;
  zaloUrl?: string | null;
}): Promise<AttachContactLinksResult> {
  const uid = await verifySb1User(input.accessToken);
  if (!uid) return { ok: false, reason: "unauthenticated" };

  const profile = await readProfileFlags(uid, input.accessToken);
  if (!profile) return { ok: false, reason: "profile_not_found" };
  if (!canUseContactLinks(profile)) return { ok: false, reason: "forbidden" };

  // Chỉ nhận URL Facebook / Zalo hợp lệ — không cho chèn link tùy ý.
  const facebook = input.facebookUrl ? normalizeFacebookUrl(input.facebookUrl) : null;
  if (input.facebookUrl && !facebook) return { ok: false, reason: "invalid_facebook_url" };

  let zalo: string | null = null;
  if (input.zaloUrl) {
    zalo = normalizeZaloPhone(input.zaloUrl) ?? zaloHrefFromPhone(input.zaloUrl);
    if (!zalo) return { ok: false, reason: "invalid_zalo_url" };
  }
  if (!facebook && !zalo) return { ok: true, applied: { facebook_url: null, zalo_url: null } };

  const key = sb3Key();
  const patch: Record<string, string> = {};
  if (facebook) patch["facebook_url"] = facebook;
  if (zalo) patch["zalo_url"] = zalo;

  // Chỉ cho phép sửa bài của chính người gửi request.
  const res = await fetch(
    `${SB3_URL}/rest/v1/posts?id=eq.${encodeURIComponent(input.postId)}&user_id=eq.${encodeURIComponent(uid)}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) return { ok: false, reason: `sb3_patch_failed_${res.status}` };
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  if (!rows?.length) return { ok: false, reason: "post_not_found" };

  return {
    ok: true,
    applied: { facebook_url: facebook, zalo_url: zalo },
  };
}
