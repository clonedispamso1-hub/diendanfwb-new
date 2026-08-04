-- =====================================================================
-- Admin Panel v2 — full backend
-- Idempotent. Run once against production DB (Supabase SQL Editor).
--
-- Depends on:
--   docs/sql/2026-07-27_admin_pr1_reset_and_block.sql
--     ( _is_current_admin, blocked_devices, admin_block_device,
--       admin_reset_password, admin_get_last_devices, device_registrations )
--   docs/sql/2026-07-27_permanent_ban.sql
--     ( admin_permanent_ban, is_phone_blocked, profiles.permanent_banned )
--   docs/sql/RUN_NOW_user_restrictions.sql
--     ( user_restrictions, has_active_restriction )
--
-- Adds:
--   admin_config            (shared secrets — CAPADMIN hash)
--   admin_violation_counts  (bulk counts of active restrictions per user)
--   admin_recent_messages   (lazy tab in profile popup)
--   admin_recent_activity   (Activity tab feed)
--   admin_grant_admin_2fa   (CAPADMIN + admin password 2-step promote)
--   admin_bulk_ban          (bulk lock w/ optional IP/device blacklist)
--   admin_bulk_unlock
--   admin_delete_user_hard  (permanent delete + phone blacklist)
--   admin_blacklist_phone / admin_unblacklist_phone
--   set_admin_capadmin      (rotate CAPADMIN — super-admin only)
-- =====================================================================

-- ---------- shared config table -------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
GRANT SELECT ON public.admin_config TO authenticated;
GRANT ALL    ON public.admin_config TO service_role;
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_config_admin_read ON public.admin_config;
CREATE POLICY admin_config_admin_read
  ON public.admin_config FOR SELECT TO authenticated
  USING (public._is_current_admin());

-- Seed default CAPADMIN if empty (default: "CAPADMIN-2026"; rotate immediately).
INSERT INTO public.admin_config(key, value)
SELECT 'capadmin_hash',
       encode(extensions.digest('CAPADMIN-2026', 'sha256'), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.admin_config WHERE key = 'capadmin_hash');

-- rotate CAPADMIN (super-admin only)
CREATE OR REPLACE FUNCTION public.set_admin_capadmin(p_new_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_new_code IS NULL OR length(btrim(p_new_code)) < 8 THEN
    RAISE EXCEPTION 'capadmin_too_short';
  END IF;
  INSERT INTO public.admin_config(key, value, updated_at, updated_by)
  VALUES ('capadmin_hash',
          encode(extensions.digest(btrim(p_new_code), 'sha256'), 'hex'),
          now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now(),
        updated_by = auth.uid();
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_admin_capadmin(text) TO authenticated;

-- ---------- violation counts (bulk) ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_violation_counts(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.user_id, count(*)::bigint
    FROM public.user_restrictions r
   WHERE r.user_id = ANY(p_user_ids)
   GROUP BY r.user_id;
$$;
GRANT EXECUTE ON FUNCTION public.admin_violation_counts(uuid[]) TO authenticated;

-- ---------- recent messages (lazy) ----------------------------------
CREATE OR REPLACE FUNCTION public.admin_recent_messages(
  p_user_id uuid, p_limit int DEFAULT 30
) RETURNS TABLE(
  id uuid, sender_id uuid, receiver_id uuid,
  content text, created_at timestamptz, is_recalled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.sender_id, m.receiver_id,
         CASE WHEN COALESCE(m.is_recalled, false) THEN '[đã thu hồi]' ELSE m.content END,
         m.created_at, COALESCE(m.is_recalled, false)
    FROM public.messages m
   WHERE (m.sender_id = p_user_id OR m.receiver_id = p_user_id)
     AND public._is_current_admin()
   ORDER BY m.created_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.admin_recent_messages(uuid, int) TO authenticated;

-- ---------- recent activity feed ------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recent_activity(
  p_user_id uuid, p_limit int DEFAULT 40
) RETURNS TABLE(kind text, ref_id uuid, summary text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (
    SELECT 'post'::text AS kind, p.id AS ref_id,
           COALESCE(NULLIF(left(p.content, 120), ''), '[bài viết]') AS summary,
           p.created_at
      FROM public.posts p WHERE p.user_id = p_user_id
    UNION ALL
    SELECT 'comment'::text, c.id,
           COALESCE(NULLIF(left(c.content, 120), ''), '[bình luận]'),
           c.created_at
      FROM public.comments c WHERE c.user_id = p_user_id
    UNION ALL
    SELECT 'device'::text, d.id, coalesce(d.ip, d.fingerprint, '[thiết bị]'), d.created_at
      FROM public.device_registrations d WHERE d.user_id = p_user_id
  )
  SELECT kind, ref_id, summary, created_at
    FROM src
   WHERE public._is_current_admin()
   ORDER BY created_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.admin_recent_activity(uuid, int) TO authenticated;

-- ---------- 2-step admin grant --------------------------------------
-- Verifies:
--   1) caller is admin
--   2) caller password matches (via extensions.crypt against auth.users)
--   3) provided capadmin code hashes to admin_config.capadmin_hash
CREATE OR REPLACE FUNCTION public.admin_grant_admin_2fa(
  p_target_user_id uuid,
  p_capadmin       text,
  p_admin_password text,
  p_revoke         boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_hash  text;
  v_stored text;
  v_pwd_ok boolean := false;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF p_capadmin IS NULL OR p_admin_password IS NULL THEN
    RAISE EXCEPTION 'missing_2fa_input';
  END IF;

  SELECT value INTO v_stored FROM public.admin_config WHERE key = 'capadmin_hash';
  IF v_stored IS NULL THEN RAISE EXCEPTION 'capadmin_not_configured'; END IF;
  v_hash := encode(extensions.digest(btrim(p_capadmin), 'sha256'), 'hex');
  IF v_hash <> v_stored THEN RAISE EXCEPTION 'capadmin_invalid'; END IF;

  -- Verify admin's own password against auth.users.
  SELECT (encrypted_password = extensions.crypt(p_admin_password, encrypted_password))
    INTO v_pwd_ok
    FROM auth.users WHERE id = v_admin;
  IF NOT COALESCE(v_pwd_ok, false) THEN RAISE EXCEPTION 'admin_password_invalid'; END IF;

  UPDATE public.profiles
     SET is_admin = NOT COALESCE(p_revoke, false)
   WHERE id = p_target_user_id;

  RETURN jsonb_build_object('ok', true, 'is_admin', NOT COALESCE(p_revoke, false));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_grant_admin_2fa(uuid, text, text, boolean) TO authenticated;

-- ---------- bulk ban / unlock ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_ban(
  p_user_ids     uuid[],
  p_days         int     DEFAULT 0,
  p_block_ip     boolean DEFAULT false,
  p_block_device boolean DEFAULT false,
  p_reason       text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until timestamptz;
  v_uid uuid;
  v_count int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  v_until := CASE WHEN p_days > 0 THEN now() + (p_days::text || ' days')::interval END;

  UPDATE public.profiles
     SET is_banned = true, banned_until = v_until,
         ban_reason = COALESCE(NULLIF(btrim(p_reason), ''), ban_reason),
         banned_at = now(), banned_by = auth.uid()
   WHERE id = ANY(p_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_block_ip OR p_block_device THEN
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      PERFORM public.admin_block_device(v_uid, p_block_ip, p_block_device, p_reason);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_ban(uuid[], int, boolean, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_unlock(p_user_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_count int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles
     SET is_banned = false, banned_until = NULL, permanent_banned = false
   WHERE id = ANY(p_user_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  FOREACH v_uid IN ARRAY p_user_ids LOOP
    DELETE FROM public.blocked_devices WHERE blocked_user_id = v_uid;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_unlock(uuid[]) TO authenticated;

-- ---------- delete user permanently ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user_hard(
  p_user_id         uuid,
  p_blacklist_phone boolean DEFAULT true,
  p_reason          text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_phone text; v_admin uuid := auth.uid();
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;

  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_user_id;

  -- Blacklist devices/IPs + phone BEFORE deleting rows they reference.
  INSERT INTO public.blocked_devices(fingerprint, ip, reason, blocked_user_id, created_by)
  SELECT DISTINCT d.fingerprint, d.ip,
         COALESCE(NULLIF(btrim(p_reason), ''), 'account_deleted'),
         NULL, v_admin
    FROM public.device_registrations d
   WHERE d.user_id = p_user_id
     AND (d.fingerprint IS NOT NULL OR d.ip IS NOT NULL);

  IF p_blacklist_phone AND v_phone IS NOT NULL AND length(btrim(v_phone)) > 0 THEN
    INSERT INTO public.blocked_devices(phone, reason, created_by)
    SELECT v_phone, COALESCE(NULLIF(btrim(p_reason), ''), 'account_deleted'), v_admin
    WHERE NOT EXISTS(
      SELECT 1 FROM public.blocked_devices WHERE phone = v_phone
    );
  END IF;

  -- Cascade delete auth user; RLS/FK ON DELETE CASCADE cleans profiles.
  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'phone', v_phone);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_hard(uuid, boolean, text) TO authenticated;

-- ---------- explicit phone blacklist tools --------------------------
CREATE OR REPLACE FUNCTION public.admin_blacklist_phone(p_phone text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_phone IS NULL OR length(btrim(p_phone)) = 0 THEN RAISE EXCEPTION 'phone_required'; END IF;
  INSERT INTO public.blocked_devices(phone, reason, created_by)
  SELECT btrim(p_phone), COALESCE(p_reason, 'manual'), auth.uid()
  WHERE NOT EXISTS(SELECT 1 FROM public.blocked_devices WHERE phone = btrim(p_phone));
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_blacklist_phone(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unblacklist_phone(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.blocked_devices
   WHERE phone = btrim(p_phone) AND blocked_user_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_unblacklist_phone(text) TO authenticated;

-- ---------- extend restriction kinds --------------------------------
-- Adds avatar_change / bio_change / gift / nearby to user_restrictions.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.user_restrictions DROP CONSTRAINT IF EXISTS user_restrictions_kind_check;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  ALTER TABLE public.user_restrictions
    ADD CONSTRAINT user_restrictions_kind_check
    CHECK (kind IN ('suspend','post','comment','like','message','find_zalo',
                    'avatar_change','bio_change','gift','nearby'));
END $$;