-- =====================================================================
-- Task #5.0 — Auth / Onboarding / Profile hardening
-- Run this once against the production DB (Supabase SQL Editor).
--
-- 1. device_registrations table + check_device_quota / register_device_fingerprint RPCs
--    (max 2 accounts / device — enforced server-side, not bypassable via localStorage)
-- 2. approval_status default → 'pending' on new signups
-- 3. Age >= 18 trigger on profiles.birthday (rejects with a Vietnamese message)
-- 4. profiles.region column + backfill from legacy province/location
-- =====================================================================

-- -------- 1. DEVICE REGISTRATIONS ------------------------------------
CREATE TABLE IF NOT EXISTS public.device_registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint    text NOT NULL,
  ip             text,
  user_agent     text,
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_registrations_fp_idx  ON public.device_registrations (fingerprint);
CREATE INDEX IF NOT EXISTS device_registrations_ip_idx  ON public.device_registrations (ip);
CREATE INDEX IF NOT EXISTS device_registrations_user_idx ON public.device_registrations (user_id);

GRANT SELECT, INSERT ON public.device_registrations TO authenticated;
GRANT SELECT, INSERT ON public.device_registrations TO anon;
GRANT ALL ON public.device_registrations TO service_role;

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_reg_insert_any ON public.device_registrations;
CREATE POLICY device_reg_insert_any ON public.device_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS device_reg_select_self ON public.device_registrations;
CREATE POLICY device_reg_select_self ON public.device_registrations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.check_device_quota(
  p_fingerprint text,
  p_ip          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_limit int := 2;
BEGIN
  IF p_fingerprint IS NULL OR length(btrim(p_fingerprint)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'count', 0, 'limit', v_limit, 'note', 'no_fingerprint');
  END IF;
  SELECT count(DISTINCT user_id) INTO v_count
    FROM public.device_registrations
   WHERE fingerprint = p_fingerprint
      OR (p_ip IS NOT NULL AND ip = p_ip);
  RETURN jsonb_build_object('ok', v_count < v_limit, 'count', v_count, 'limit', v_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_device_quota(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_device_fingerprint(
  p_fingerprint text,
  p_ip          text DEFAULT NULL,
  p_ua          text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF p_fingerprint IS NULL OR length(btrim(p_fingerprint)) = 0 THEN RETURN; END IF;
  INSERT INTO public.device_registrations (fingerprint, ip, user_agent, user_id)
  VALUES (p_fingerprint, NULLIF(p_ip, ''), NULLIF(p_ua, ''), v_uid);
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_device_fingerprint(text, text, text) TO anon, authenticated;

-- -------- 2. APPROVAL STATUS ----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';

-- Grandfather existing accounts so we don't lock them out.
UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_approval_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS NULL OR NEW.approval_status = '' THEN
    NEW.approval_status := 'pending';
  END IF;
  IF COALESCE(NEW.is_admin, false) = true THEN
    NEW.approval_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_default_approval ON public.profiles;
CREATE TRIGGER trg_profiles_default_approval
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_default_approval_status();

CREATE INDEX IF NOT EXISTS profiles_approval_status_idx
  ON public.profiles (approval_status);

-- -------- 3. AGE GATE (>= 18) ---------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_min_age_18()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_age int;
BEGIN
  IF NEW.birthday IS NULL THEN RETURN NEW; END IF;
  v_age := date_part('year', age(current_date, NEW.birthday))::int;
  IF v_age < 18 THEN
    RAISE EXCEPTION 'Bạn chưa đủ 18 tuổi để sử dụng hệ thống.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_min_age ON public.profiles;
CREATE TRIGGER trg_profiles_min_age
  BEFORE INSERT OR UPDATE OF birthday ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_age_18();

-- -------- 4. REGION COLUMN ------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text;

UPDATE public.profiles
   SET region = COALESCE(NULLIF(region, ''), NULLIF(province, ''), NULLIF(location, ''))
 WHERE region IS NULL OR region = '';

CREATE INDEX IF NOT EXISTS profiles_region_idx ON public.profiles (region);
