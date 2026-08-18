-- =====================================================================
-- BLOCK LEVEL 3 — REALTIME PUSH + BACKEND SECURITY (chay 1 lan, idempotent)
-- Project: zbuwddjcqdlyijcunwgd  (KHONG doi URL / API key / du lieu cu)
--
-- Gom 3 phan:
--   1) Bat Realtime cho bang profiles  -> Laptop B nhan event < 1s
--   2) RLS + RPC guard: ban_level >= 3 => Permission denied o BACKEND
--   3) Device fingerprint ban: bang blocked_devices + RPC device_is_blocked
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Bang khoa thiet bi / cookie (tao neu chua co)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_devices_fp_key ON public.blocked_devices (fingerprint);

CREATE TABLE IF NOT EXISTS public.blocked_cookies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cookie_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_cookies_cookie_key ON public.blocked_cookies (cookie_id);

GRANT ALL ON public.blocked_devices TO service_role;
GRANT ALL ON public.blocked_cookies TO service_role;
ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_cookies ENABLE ROW LEVEL SECURITY;
-- Khong cap SELECT cho anon/authenticated: chi doc qua RPC SECURITY DEFINER.

-- ---------------------------------------------------------------------
-- 1) Helper: tai khoan co bi khoa vinh vien (ban_level >= 3) khong?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_hard_banned(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT COALESCE(p.ban_level, 0) >= 3 AND COALESCE(p.is_admin, false) = false
    FROM public.profiles p
    WHERE p.id = _uid
  ), false);
$fn$;
GRANT EXECUTE ON FUNCTION public.is_hard_banned(uuid) TO anon, authenticated, service_role;

-- Dung o dau moi RPC SECURITY DEFINER (chuyen xu, cuoc game, dang bai...):
--     PERFORM public.enforce_not_banned();
CREATE OR REPLACE FUNCTION public.enforce_not_banned()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.is_hard_banned(auth.uid()) THEN
    RAISE EXCEPTION 'Account is permanently restricted' USING ERRCODE = '42501';
  END IF;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.enforce_not_banned() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) RLS: chan INSERT / UPDATE / DELETE khi ban_level >= 3
--    (policy RESTRICTIVE — cong them vao cac policy san co, khong thay the)
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'posts','comments','likes','comment_likes','messages','follows','profiles',
    'stories','conversations','notifications','user_reports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE c.relname=t AND n.nspname='public' AND c.relkind='r') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      EXECUTE format('DROP POLICY IF EXISTS "block_level3_no_insert" ON public.%I', t);
      EXECUTE format($p$CREATE POLICY "block_level3_no_insert" ON public.%I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (NOT public.is_hard_banned(auth.uid()))$p$, t);

      EXECUTE format('DROP POLICY IF EXISTS "block_level3_no_update" ON public.%I', t);
      EXECUTE format($p$CREATE POLICY "block_level3_no_update" ON public.%I
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (NOT public.is_hard_banned(auth.uid()))
        WITH CHECK (NOT public.is_hard_banned(auth.uid()))$p$, t);

      EXECUTE format('DROP POLICY IF EXISTS "block_level3_no_delete" ON public.%I', t);
      EXECUTE format($p$CREATE POLICY "block_level3_no_delete" ON public.%I
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (NOT public.is_hard_banned(auth.uid()))$p$, t);
    END IF;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- 3) Storage: chan upload / sua / xoa file khi ban_level >= 3
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "block_level3_no_upload" ON storage.objects';
    EXECUTE $p$CREATE POLICY "block_level3_no_upload" ON storage.objects
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_hard_banned(auth.uid()))$p$;
    EXECUTE 'DROP POLICY IF EXISTS "block_level3_no_object_update" ON storage.objects';
    EXECUTE $p$CREATE POLICY "block_level3_no_object_update" ON storage.objects
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (NOT public.is_hard_banned(auth.uid()))
      WITH CHECK (NOT public.is_hard_banned(auth.uid()))$p$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Bo qua storage policy (thieu quyen) — tao thu cong trong Dashboard > Storage > Policies';
  END;
END
$do$;

-- ---------------------------------------------------------------------
-- 4) Device fingerprint ban
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_is_blocked(
  p_fingerprint text DEFAULT NULL,
  p_cookie text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_devices b
     WHERE p_fingerprint IS NOT NULL
       AND b.fingerprint = p_fingerprint
       AND NOT public.fingerprint_is_shared(p_fingerprint)
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_cookies c
     WHERE p_cookie IS NOT NULL AND c.cookie_id = p_cookie
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.device_is_blocked(text, text) TO anon, authenticated, service_role;

-- Trigger: ban_level >= 3 -> ghi fingerprint/cookie vao danh sach khoa,
--          ban_level < 3  -> go khoa (neu khong con tai khoan Level 3 nao dung chung).
CREATE OR REPLACE FUNCTION public.tg_ban_level3_lock_devices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF COALESCE(NEW.ban_level, 0) >= 3 AND COALESCE(NEW.is_admin, false) = false THEN
    INSERT INTO public.blocked_devices (fingerprint, reason)
    SELECT DISTINCT d.fingerprint, 'ban_level_3'
      FROM public.device_accounts d
     WHERE d.user_id = NEW.id AND d.fingerprint IS NOT NULL
       AND NOT public.fingerprint_is_shared(d.fingerprint)
    ON CONFLICT (fingerprint) DO NOTHING;

    INSERT INTO public.blocked_cookies (cookie_id, reason)
    SELECT DISTINCT d.cookie_id, 'ban_level_3'
      FROM public.device_accounts d
     WHERE d.user_id = NEW.id AND d.cookie_id IS NOT NULL
    ON CONFLICT (cookie_id) DO NOTHING;
  ELSE
    DELETE FROM public.blocked_devices b
     WHERE b.reason = 'ban_level_3'
       AND b.fingerprint IN (SELECT d.fingerprint FROM public.device_accounts d WHERE d.user_id = NEW.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.device_accounts d2
           JOIN public.profiles p2 ON p2.id = d2.user_id
          WHERE d2.fingerprint = b.fingerprint AND d2.user_id <> NEW.id
            AND COALESCE(p2.is_admin,false) = false AND COALESCE(p2.ban_level,0) >= 3);

    DELETE FROM public.blocked_cookies b
     WHERE b.reason = 'ban_level_3'
       AND b.cookie_id IN (SELECT d.cookie_id FROM public.device_accounts d WHERE d.user_id = NEW.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.device_accounts d2
           JOIN public.profiles p2 ON p2.id = d2.user_id
          WHERE d2.cookie_id = b.cookie_id AND d2.user_id <> NEW.id
            AND COALESCE(p2.is_admin,false) = false AND COALESCE(p2.ban_level,0) >= 3);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ban_level3_lock_devices ON public.profiles;
CREATE TRIGGER trg_ban_level3_lock_devices
  AFTER UPDATE OF ban_level ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_ban_level3_lock_devices();

-- ---------------------------------------------------------------------
-- 5) REALTIME: day event UPDATE cua profiles xuong client
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
DO $do$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$do$;

COMMIT;
