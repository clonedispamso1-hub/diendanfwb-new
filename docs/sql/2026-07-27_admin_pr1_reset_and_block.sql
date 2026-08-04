-- =====================================================================
-- Admin Panel PR #1 — Reset password + Block IP/Device
-- Idempotent. Run once against production DB.
-- =====================================================================

-- -------- blocked_devices table -------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint     text,
  ip              text,
  reason          text,
  blocked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blocked_devices_fp_idx   ON public.blocked_devices (fingerprint);
CREATE INDEX IF NOT EXISTS blocked_devices_ip_idx   ON public.blocked_devices (ip);
CREATE INDEX IF NOT EXISTS blocked_devices_user_idx ON public.blocked_devices (blocked_user_id);

GRANT SELECT ON public.blocked_devices TO anon, authenticated;
GRANT ALL    ON public.blocked_devices TO service_role;

ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blk_dev_read ON public.blocked_devices;
CREATE POLICY blk_dev_read ON public.blocked_devices
  FOR SELECT TO anon, authenticated USING (true);

-- -------- admin gate helper -----------------------------------------
CREATE OR REPLACE FUNCTION public._is_current_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION public._is_current_admin() TO authenticated;

-- -------- extend check_device_quota to honour block list ------------
CREATE OR REPLACE FUNCTION public.check_device_quota(
  p_fingerprint text,
  p_ip          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_limit int := 2; v_blocked boolean := false;
BEGIN
  IF p_fingerprint IS NULL OR length(btrim(p_fingerprint)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'count', 0, 'limit', v_limit, 'note', 'no_fingerprint');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.blocked_devices
     WHERE (fingerprint IS NOT NULL AND fingerprint = p_fingerprint)
        OR (p_ip IS NOT NULL AND ip IS NOT NULL AND ip = p_ip)
  ) INTO v_blocked;
  IF v_blocked THEN
    RETURN jsonb_build_object('ok', false, 'blocked', true, 'count', v_limit, 'limit', v_limit);
  END IF;

  SELECT count(DISTINCT user_id) INTO v_count
    FROM public.device_registrations
   WHERE fingerprint = p_fingerprint
      OR (p_ip IS NOT NULL AND ip = p_ip);
  RETURN jsonb_build_object('ok', v_count < v_limit, 'count', v_count, 'limit', v_limit);
END;
$$;

-- -------- admin_block_device ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_block_device(
  p_user_id       uuid,
  p_block_ip      boolean DEFAULT false,
  p_block_device  boolean DEFAULT false,
  p_reason        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; c int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF NOT (p_block_ip OR p_block_device) THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0, 'note', 'nothing_to_block');
  END IF;
  FOR r IN
    SELECT DISTINCT fingerprint, ip FROM public.device_registrations
     WHERE user_id = p_user_id
  LOOP
    IF (p_block_device AND r.fingerprint IS NOT NULL)
       OR (p_block_ip AND r.ip IS NOT NULL) THEN
      INSERT INTO public.blocked_devices(fingerprint, ip, reason, blocked_user_id, created_by)
      VALUES (
        CASE WHEN p_block_device THEN r.fingerprint END,
        CASE WHEN p_block_ip     THEN r.ip END,
        p_reason, p_user_id, auth.uid()
      );
      c := c + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'inserted', c);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_block_device(uuid, boolean, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unblock_user_devices(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.blocked_devices WHERE blocked_user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user_devices(uuid) TO authenticated;

-- -------- admin_reset_password --------------------------------------
-- Requires pgcrypto (Supabase enables it in the "extensions" schema).
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_user_id      uuid,
  p_new_password text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 5 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;
  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at         = now()
   WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;

-- -------- admin_get_last_device (fast column for members table) -----
CREATE OR REPLACE FUNCTION public.admin_get_last_devices(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, fingerprint text, ip text, user_agent text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (d.user_id)
         d.user_id, d.fingerprint, d.ip, d.user_agent, d.created_at
    FROM public.device_registrations d
   WHERE d.user_id = ANY(p_user_ids)
   ORDER BY d.user_id, d.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_last_devices(uuid[]) TO authenticated;
