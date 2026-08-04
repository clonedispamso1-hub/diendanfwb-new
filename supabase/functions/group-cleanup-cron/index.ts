// Cron entry point — call hourly. At 00:00 UTC also resets daily counters.
// Schedule via Supabase Dashboard → Edge Functions → Schedules: `0 * * * *`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1) Always purge archived > 24h and snapshot stats
  const { error: e1 } = await admin.rpc('cleanup_archived_group_messages');

  // 2) At UTC midnight hour, reset daily counters
  let reset = false;
  if (new Date().getUTCHours() === 0) {
    const { error: e2 } = await admin.rpc('reset_group_daily_stats');
    if (e2) {
      return new Response(JSON.stringify({ ok: false, step: 'reset', error: e2.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    reset = true;
  }

  if (e1) {
    return new Response(JSON.stringify({ ok: false, step: 'cleanup', error: e1.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, reset }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
