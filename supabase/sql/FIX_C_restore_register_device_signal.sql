-- =====================================================================
-- FIX C — Restore canonical public.register_device_signal (Supabase #1)
-- ---------------------------------------------------------------------
-- Symptom : POST /rest/v1/rpc/register_device_signal -> 404.
-- Cause   : RPC defined in 20260811000000_anti_clone_lock_v3.sql (§8) is
--           absent from supabase/sql/INIT_CLEAN_SB1.sql, so it was lost in
--           the Supabase #1 reset.
-- Source  : function body, signature, return type, SECURITY DEFINER,
--           search_path and GRANT (authenticated only) copied VERBATIM
--           from 20260811000000_anti_clone_lock_v3.sql. No behaviour change.
-- Deps    : public.security_gate(text,text,text)      (anti_clone_lock_v3 §3)
--           public.device_accounts (+ device cols)     (member_intel_v2 §0)
--           public.member_activity_log (ip,fingerprint)(member_intel_v2)
-- Safety  : preflight aborts the whole migration (nothing created) if any
--           dependency is missing — no stub tables/functions are invented.
--           If it aborts, restore the reported canonical migrations first.
-- =====================================================================

DO $$
DECLARE missing text[] := '{}'; col text;
BEGIN
  IF to_regprocedure('public.security_gate(text,text,text)') IS NULL THEN
    missing := missing || 'function public.security_gate(text,text,text)';
  END IF;
  IF to_regclass('public.device_accounts') IS NULL THEN
    missing := missing || 'table public.device_accounts';
  ELSE
    FOREACH col IN ARRAY ARRAY['id','user_id','fingerprint','ip','user_agent','device_type','os','browser','country','isp','cookie_id','last_seen','created_at'] LOOP
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='device_accounts' AND column_name=col) THEN
        missing := missing || ('column public.device_accounts.' || col);
      END IF;
    END LOOP;
  END IF;
  IF to_regclass('public.member_activity_log') IS NULL THEN
    missing := missing || 'table public.member_activity_log';
  ELSE
    FOREACH col IN ARRAY ARRAY['user_id','action','detail','ip','fingerprint'] LOOP
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='member_activity_log' AND column_name=col) THEN
        missing := missing || ('column public.member_activity_log.' || col);
      END IF;
    END LOOP;
  END IF;
  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'FIX C aborted, missing canonical dependencies: %', array_to_string(missing, ', ');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.register_device_signal(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.register_device_signal(
  p_fingerprint text,
  p_ip          text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_os          text DEFAULT NULL,
  p_browser     text DEFAULT NULL,
  p_country     text DEFAULT NULL,
  p_isp         text DEFAULT NULL,
  p_cookie_id   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); prev record; v_gate jsonb;
BEGIN
  IF uid IS NULL OR p_fingerprint IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'blocked', false, 'error', 'no_session');
  END IF;

  -- Cổng bảo vệ: device/ip/cookie/member bị khóa thì không ghi nhận.
  v_gate := public.security_gate(p_fingerprint, p_ip, p_cookie_id);
  IF (v_gate->>'blocked')::boolean THEN RETURN v_gate; END IF;

  SELECT * INTO prev FROM public.device_accounts
   WHERE user_id = uid ORDER BY COALESCE(last_seen, created_at) DESC LIMIT 1;

  IF prev.id IS NOT NULL AND prev.fingerprint IS DISTINCT FROM p_fingerprint THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'device_change', prev.fingerprint || ' → ' || p_fingerprint, p_ip, p_fingerprint);
  ELSIF prev.id IS NOT NULL AND p_ip IS NOT NULL AND prev.ip IS DISTINCT FROM p_ip THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'ip_change', COALESCE(prev.ip,'—') || ' → ' || p_ip, p_ip, p_fingerprint);
  END IF;

  UPDATE public.device_accounts SET
    ip = COALESCE(p_ip, ip), user_agent = COALESCE(p_user_agent, user_agent),
    device_type = COALESCE(p_device_type, device_type), os = COALESCE(p_os, os),
    browser = COALESCE(p_browser, browser), country = COALESCE(p_country, country),
    isp = COALESCE(p_isp, isp), cookie_id = COALESCE(p_cookie_id, cookie_id),
    last_seen = now()
  WHERE user_id = uid AND fingerprint = p_fingerprint;

  IF NOT FOUND THEN
    INSERT INTO public.device_accounts(
      user_id, fingerprint, ip, user_agent, device_type, os, browser, country, isp, cookie_id, last_seen)
    VALUES (uid, p_fingerprint, p_ip, p_user_agent, p_device_type, p_os, p_browser, p_country, p_isp, p_cookie_id, now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.register_device_signal(text,text,text,text,text,text,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
