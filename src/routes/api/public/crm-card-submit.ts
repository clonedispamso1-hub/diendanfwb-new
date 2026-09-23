import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORE_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SOCIAL_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

const schema = z.object({
  cardId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\d{10}$/),
  region: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
});

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const headers = (key: string, extra: Record<string, string> = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra });

function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function decodeCard(content: string): { cardId?: string; location?: string; status?: string } | null {
  const match = /\[\[crmcard:([A-Za-z0-9+/=_-]+)\]\]/.exec(content);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch { return null; }
}

function encodeCard(payload: Record<string, unknown>) {
  return `[[crmcard:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}]]`;
}

/**
 * Xác minh người phát hành card là Admin thật.
 * Dự án dùng 2 nguồn quyền admin (cùng nguồn với client: admin-db.ts):
 *  1) bảng user_roles (role = admin/super_admin)
 *  2) cờ hợp lệ trên profiles (is_admin = true, hoặc role = admin)
 * Không hard-code admin, không bypass: thiếu cả 2 nguồn => từ chối.
 */
async function isAdminUser(userId: string, coreKey: string): Promise<boolean> {
  try {
    const rolesRes = await fetch(
      `${CORE_URL}/rest/v1/user_roles?select=user_id,role&user_id=eq.${userId}&role=in.(admin,super_admin)&limit=1`,
      { headers: headers(coreKey) },
    );
    if (rolesRes.ok) {
      const rows = await rolesRes.json() as unknown[];
      if (Array.isArray(rows) && rows.length > 0) return true;
    }
  } catch (cause) {
    console.error("[crm-card-submit] user_roles lookup failed", cause);
  }
  try {
    const profileRes = await fetch(
      `${CORE_URL}/rest/v1/profiles?select=id,is_admin,role&id=eq.${userId}&limit=1`,
      { headers: headers(coreKey) },
    );
    if (profileRes.ok) {
      const rows = await profileRes.json() as Array<{ is_admin?: boolean | null; role?: string | null }>;
      const profile = Array.isArray(rows) ? rows[0] : undefined;
      if (profile && (profile.is_admin === true || profile.role === "admin" || profile.role === "super_admin")) return true;
    }
  } catch (cause) {
    console.error("[crm-card-submit] profiles lookup failed", cause);
  }
  return false;
}

async function submit(request: Request) {
  const coreKey = process.env["SUPABASE1_SERVICE_ROLE_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const socialKey = process.env["SUPABASE3_SERVICE_ROLE_KEY"];
  if (!coreKey || !socialKey) {
    const missing = [!coreKey && "SUPABASE1_SERVICE_ROLE_KEY", !socialKey && "SUPABASE3_SERVICE_ROLE_KEY"].filter(Boolean).join(", ");
    console.error(`[crm-card-submit] thiếu secret: ${missing}`);
    return Response.json({ error: "Dịch vụ CRM chưa sẵn sàng (máy chủ thiếu khoá kết nối CRM). Vui lòng báo Admin." }, { status: 503, headers: cors });
  }

  const accessToken = bearer(request);
  if (!accessToken) return Response.json({ error: "Vui lòng đăng nhập lại." }, { status: 401, headers: cors });
  const auth = await fetch(`${CORE_URL}/auth/v1/user`, { headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` } });
  if (!auth.ok) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401, headers: cors });
  const user = await auth.json() as { id?: string };
  if (!user.id) return Response.json({ error: "Không xác định được tài khoản." }, { status: 401, headers: cors });

  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); }
  catch { return Response.json({ error: "Thông tin chưa hợp lệ." }, { status: 400, headers: cors }); }

  const cardUrl = new URL(`${SOCIAL_URL}/rest/v1/messages`);
  cardUrl.searchParams.set("select", "id,content,sender_id,receiver_id");
  cardUrl.searchParams.set("receiver_id", `eq.${user.id}`);
  cardUrl.searchParams.set("content", "like.[[crmcard:%");
  cardUrl.searchParams.set("order", "created_at.desc");
  cardUrl.searchParams.set("limit", "100");
  const cardRes = await fetch(cardUrl, { headers: headers(socialKey) });
  const cards = cardRes.ok ? await cardRes.json() as Array<{ id: string; content: string; sender_id: string }> : [];
  const card = cards.find((item) => decodeCard(item.content)?.cardId === input.cardId);
  const payload = card ? decodeCard(card.content) : null;
  if (!card || payload?.cardId !== input.cardId) return Response.json({ error: "Card không hợp lệ hoặc đã hết hạn." }, { status: 404, headers: cors });
  if (payload.status === "submitted") return Response.json({ ok: true, duplicate: true }, { headers: cors });
  const senderIsAdmin = await isAdminUser(card.sender_id, coreKey);
  if (!senderIsAdmin) {
    console.error(`[crm-card-submit] sender không phải admin: ${card.sender_id}`);
    return Response.json({ error: "Card không do Admin phát hành." }, { status: 403, headers: cors });
  }

  const duplicateUrl = new URL(`${CORE_URL}/rest/v1/crm_customers`);
  duplicateUrl.searchParams.set("select", "id");
  duplicateUrl.searchParams.set("phone", `eq.${input.phone}`);
  duplicateUrl.searchParams.set("limit", "1");
  const duplicateRes = await fetch(duplicateUrl, { headers: headers(coreKey) });
  if (!duplicateRes.ok) return Response.json({ error: "Không kiểm tra được số Zalo, vui lòng thử lại." }, { status: 500, headers: cors });
  const duplicates = await duplicateRes.json() as Array<{ id: string }>;
  if (duplicates.length > 0) return Response.json({ error: "Số Zalo này đã được nhập rồi." }, { status: 409, headers: cors });

  const submittedContent = encodeCard({ cardId: input.cardId, location: payload.location, status: "submitted", submittedAt: new Date().toISOString(), name: input.name, phone: input.phone, region: input.region, district: input.district });
  const claim = await fetch(`${SOCIAL_URL}/rest/v1/messages?id=eq.${card.id}&content=eq.${encodeURIComponent(card.content)}`, {
    method: "PATCH", headers: headers(socialKey, { Prefer: "return=representation" }), body: JSON.stringify({ content: submittedContent }),
  });
  const claimed = claim.ok ? await claim.json() as unknown[] : [];
  if (!claimed.length) return Response.json({ ok: true, duplicate: true }, { headers: cors });

  const crmInsert = await fetch(`${CORE_URL}/rest/v1/crm_customers`, {
    method: "POST", headers: headers(coreKey, { Prefer: "return=minimal" }),
    body: JSON.stringify({ name: input.name, phone: input.phone, region: input.region }),
  });
  if (!crmInsert.ok) {
    await fetch(`${SOCIAL_URL}/rest/v1/messages?id=eq.${card.id}`, { method: "PATCH", headers: headers(socialKey), body: JSON.stringify({ content: card.content }) });
    const detail = await crmInsert.text();
    if (/duplicate|unique/i.test(detail)) return Response.json({ error: "Số Zalo này đã được nhập rồi." }, { status: 409, headers: cors });
    return Response.json({ error: "Không lưu được thông tin CRM, vui lòng thử lại." }, { status: 500, headers: cors });
  }

  await fetch(`${SOCIAL_URL}/rest/v1/notifications`, {
    method: "POST", headers: headers(socialKey, { Prefer: "return=minimal" }),
    body: JSON.stringify({ user_id: card.sender_id, type: "crm_submission", title: "CRM khách hàng", message: `${input.name} đã gửi thông tin CRM`, related_id: user.id, data: { card_id: input.cardId, customer_id: user.id }, link: `/chat/${user.id}`, is_read: false }),
  });
  return Response.json({ ok: true }, { headers: cors });
}

async function safeSubmit(request: Request) {
  try { return await submit(request); }
  catch (cause) {
    console.error("[crm-card-submit] unexpected", cause);
    return Response.json({ error: "Không gửi được thông tin, vui lòng thử lại." }, { status: 500, headers: cors });
  }
}

export const Route = createFileRoute("/api/public/crm-card-submit")({ server: { handlers: { OPTIONS: () => new Response(null, { headers: cors }), POST: ({ request }) => safeSubmit(request) } } });