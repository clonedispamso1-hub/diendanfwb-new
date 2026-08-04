-- =====================================================================
-- Permanent Ban system
-- Idempotent. Run once against the production Supabase DB.
--
-- Depends on:
--   docs/sql/2026-07-27_admin_pr1_reset_and_block.sql
--     (creates blocked_devices, _is_current_admin, admin_block_device,
--      device_registrations, check_device_quota)
--
-- Adds:
--   profiles.permanent_banned / ban_reason / banned_at / banned_by
--   blocked_devices.phone column + index
--   admin_permanent_ban(p_user_id uuid, p_reason text)
--   is_phone_blocked(p_phone text)
-- =====================================================================

-- 1. profiles: extra columns to record the permanent ban --------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permanent_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason       text,
  ADD COLUMN IF NOT EXISTS banned_at        timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by        uuid;

CREATE INDEX IF NOT EXISTS profiles_permanent_banned_idx
  ON public.profiles (permanent_banned) WHERE permanent_banned;

-- 2. blocked_devices: phone column ------------------------------------
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS blocked_devices_phone_idx
  ON public.blocked_devices (phone) WHERE phone IS NOT NULL;

-- 3. is_phone_blocked -------------------------------------------------
-- Public read: registration flow needs to call it without auth.
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.blocked_devices
     WHERE phone IS NOT NULL
       AND p_phone IS NOT NULL
       AND length(btrim(p_phone)) > 0
       AND phone = p_phone
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_phone_blocked(text) TO anon, authenticated;

-- 4. admin_permanent_ban ----------------------------------------------
-- Locks the account, blacklists ALL known fingerprints/IPs and the
-- current profile phone, and kills every active auth session.
CREATE OR REPLACE FUNCTION public.admin_permanent_ban(
  p_user_id uuid,
  p_reason  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_phone text;
  v_dev_count int := 0;
  v_phone_count int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  -- Snapshot profile phone before mutating.
  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_user_id;

  -- Flag the profile as permanently banned.
  UPDATE public.profiles
     SET is_banned        = true,
         banned_until     = NULL,
         permanent_banned = true,
         ban_reason       = COALESCE(NULLIF(btrim(p_reason), ''), ban_reason),
         banned_at        = now(),
         banned_by        = v_admin
   WHERE id = p_user_id;

  -- Blacklist every fingerprint + IP ever recorded for this user.
  INSERT INTO public.blocked_devices(fingerprint, ip, reason, blocked_user_id, created_by)
  SELECT DISTINCT d.fingerprint, d.ip,
         COALESCE(NULLIF(btrim(p_reason), ''), 'permanent_ban'),
         p_user_id, v_admin
    FROM public.device_registrations d
   WHERE d.user_id = p_user_id
     AND (d.fingerprint IS NOT NULL OR d.ip IS NOT NULL);
  GET DIAGNOSTICS v_dev_count = ROW_COUNT;

  -- Blacklist the phone (if present and not already blacklisted).
  IF v_phone IS NOT NULL AND length(btrim(v_phone)) > 0 THEN
    INSERT INTO public.blocked_devices(phone, reason, blocked_user_id, created_by)
    SELECT v_phone,
           COALESCE(NULLIF(btrim(p_reason), ''), 'permanent_ban'),
           p_user_id, v_admin
    WHERE NOT EXISTS (
      SELECT 1 FROM public.blocked_devices
       WHERE phone = v_phone
    );
    GET DIAGNOSTICS v_phone_count = ROW_COUNT;
  END IF;

  -- Kill every active session (forces sign-out on all devices).
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  -- Refresh tokens are cascaded from auth.sessions in stock Supabase,
  -- but delete defensively in case of custom configuration.
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id::uuid = p_user_id;
  EXCEPTION WHEN others THEN
    -- refresh_tokens.user_id is text on some projects; ignore mismatch.
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'devices_blocked', v_dev_count,
    'phone_blocked',   v_phone_count,
    'phone',           v_phone
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban(uuid, text) TO authenticated;
