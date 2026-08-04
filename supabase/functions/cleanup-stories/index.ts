// Cleanup expired stories.
// Trigger: pg_cron mỗi 15 phút hoặc Supabase Dashboard → Edge Functions → Schedules.
//
// Media host là Cloudinary (xoá cần API Secret), nên function chỉ dọn
// row hết hạn trong DB. Không cần secret nào ngoài SUPABASE_*.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: expired, error } = await admin
    .from("stories")
    .select("id")
    .lt("expires_at", new Date().toISOString())
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ ok: false, step: "select", error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = expired ?? [];
  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.id);
    await admin.from("stories").delete().in("id", ids);
  }

  return new Response(
    JSON.stringify({ ok: true, expired: rows.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
