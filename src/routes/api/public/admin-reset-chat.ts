/**
 * Admin → Quản lý Tin nhắn → "Reset dữ liệu".
 *
 * Supabase #3 (chat) chưa verify được JWT của Supabase #1, nên auth.uid()
 * trên #3 luôn NULL. Vì vậy:
 *   1) Endpoint này xác thực Admin trên Supabase #1 bằng token người gọi
 *      (bangchu approved+active hoặc profiles.is_admin — giống isAdminNow()).
 *   2) Sau đó gọi RPC public.admin_reset_chat_data() trên Supabase #3 bằng
 *      SB3_SERVICE_ROLE_KEY (chỉ ở server). RPC trên #3 chỉ cấp cho service_role.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SB1_URL = "https://gxfxqbhxoghdhokwjpex.supabase.co";
const SB1_KEY = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";
const SB3_URL = "https://uaqsetfdciyzxpuhulux.supabase.co";

const noSession = { storage: undefined, persistSession: false, autoRefreshToken: false } as const;

async function isAdmin(token: string): Promise<boolean> {
  const sb1 = createClient(SB1_URL, SB1_KEY, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth } = await sb1.auth.getUser(token);
  const uid = auth?.user?.id;
  if (!uid) return false;
  const { data: bc } = await sb1
    .from("bangchu")
    .select("status,is_active")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (bc && (bc as any).status === "approved" && (bc as any).is_active) return true;
  const { data: pf } = await sb1.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
  return (pf as any)?.is_admin === true;
}

export const Route = createFileRoute("/api/public/admin-reset-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        if (!(await isAdmin(token))) {
          return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        const serviceKey = process.env["SB3_SERVICE_ROLE_KEY"];
        if (!serviceKey) {
          return Response.json(
            { ok: false, error: "Thiếu cấu hình SB3_SERVICE_ROLE_KEY trên server" },
            { status: 503 },
          );
        }
        const sb3 = createClient(SB3_URL, serviceKey, { auth: noSession });
        const { data, error } = await sb3.rpc("admin_reset_chat_data");
        if (error) {
          return Response.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
        }
        return Response.json({ ok: true, deleted: data ?? 0 });
      },
    },
  },
});
