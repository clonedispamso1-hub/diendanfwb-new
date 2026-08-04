-- =============================================================
-- SECURITY HARDENING MIGRATION — Run in Supabase SQL Editor
-- Project: zbuwddjcqdlyijcunwgd
-- Date: 2026-05-30
--
-- Idempotent: safe to re-run. Verifies RLS, grants, gem RPC,
-- audit logging, and admin role infrastructure.
-- =============================================================

-- -------------------------------------------------------------
-- 1. ENABLE RLS on all sensitive tables (idempotent)
-- -------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','posts','comments','messages','gifts',
    'notifications','followers','transactions','user_settings'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END$$;

-- -------------------------------------------------------------
-- 2. ROLES — separate user_roles table (prevents privilege escalation)
-- -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- NO insert/update/delete policies → only service_role (or SECURITY DEFINER fns) can grant roles.

-- -------------------------------------------------------------
-- 3. AUDIT LOG
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs(action, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL    ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "audit admins read" ON public.audit_logs;
CREATE POLICY "audit admins read" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_audit(_action text, _target_type text, _target_id text, _metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, COALESCE(_metadata,'{}'::jsonb));
END$$;

-- -------------------------------------------------------------
-- 4. SECURE GEM TRANSFER — server-side only
-- All gem changes MUST go through this RPC. Frontend cannot modify
-- profiles.gem directly because of the RLS column policy below.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gem_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id text UNIQUE,            -- idempotency key from client
  sender_id uuid REFERENCES auth.users(id),
  receiver_id uuid REFERENCES auth.users(id),
  amount bigint NOT NULL CHECK (amount > 0),
  kind text NOT NULL,                       -- 'gift','tip','admin_grant','purchase'
  sender_balance_after bigint,
  receiver_balance_after bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gem_tx_sender_idx ON public.gem_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gem_tx_receiver_idx ON public.gem_transactions(receiver_id, created_at DESC);

ALTER TABLE public.gem_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.gem_transactions TO authenticated;
GRANT ALL    ON public.gem_transactions TO service_role;

DROP POLICY IF EXISTS "gem_tx own read" ON public.gem_transactions;
CREATE POLICY "gem_tx own read" ON public.gem_transactions
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.transfer_gems(
  _receiver uuid,
  _amount bigint,
  _kind text,
  _client_request_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sender uuid := auth.uid();
  _sender_bal bigint;
  _receiver_bal bigint;
  _existing public.gem_transactions%ROWTYPE;
BEGIN
  IF _sender IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _receiver IS NULL OR _receiver = _sender THEN RAISE EXCEPTION 'invalid receiver'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF _kind NOT IN ('gift','tip') THEN RAISE EXCEPTION 'invalid kind'; END IF;

  -- Idempotency: if same client_request_id was used, return previous result.
  IF _client_request_id IS NOT NULL THEN
    SELECT * INTO _existing FROM public.gem_transactions WHERE client_request_id = _client_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('ok',true,'duplicate',true,'tx_id',_existing.id);
    END IF;
  END IF;

  -- Lock sender row, check balance.
  SELECT gem INTO _sender_bal FROM public.profiles WHERE id = _sender FOR UPDATE;
  IF _sender_bal IS NULL OR _sender_bal < _amount THEN
    RAISE EXCEPTION 'insufficient gem';
  END IF;

  SELECT gem INTO _receiver_bal FROM public.profiles WHERE id = _receiver FOR UPDATE;
  IF _receiver_bal IS NULL THEN RAISE EXCEPTION 'receiver not found'; END IF;

  UPDATE public.profiles SET gem = gem - _amount WHERE id = _sender;
  UPDATE public.profiles SET gem = gem + _amount WHERE id = _receiver;

  INSERT INTO public.gem_transactions(
    client_request_id, sender_id, receiver_id, amount, kind,
    sender_balance_after, receiver_balance_after
  ) VALUES (
    _client_request_id, _sender, _receiver, _amount, _kind,
    _sender_bal - _amount, _receiver_bal + _amount
  ) RETURNING id INTO _existing.id;

  PERFORM public.log_audit('gem.transfer','user',_receiver::text,
    jsonb_build_object('amount',_amount,'kind',_kind,'tx_id',_existing.id));

  RETURN jsonb_build_object('ok',true,'tx_id',_existing.id,
    'sender_balance',_sender_bal-_amount,'receiver_balance',_receiver_bal+_amount);
END$$;

REVOKE ALL ON FUNCTION public.transfer_gems(uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_gems(uuid,bigint,text,text) TO authenticated;

-- -------------------------------------------------------------
-- 5. PROFILES — block direct gem / role / vip mutation by users
-- Users may update their own profile EXCEPT protected columns.
-- -------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN
    -- Drop any over-permissive policies first
    EXECUTE 'DROP POLICY IF EXISTS "profiles self update" ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles';

    EXECUTE $POL$
      CREATE POLICY "profiles self update safe columns" ON public.profiles
        FOR UPDATE TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())
    $POL$;

    -- Prevent gem / is_admin / is_vip tampering via trigger.
    CREATE OR REPLACE FUNCTION public.profiles_block_privileged_columns()
    RETURNS trigger LANGUAGE plpgsql AS $T$
    BEGIN
      IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN
        IF NEW.gem IS DISTINCT FROM OLD.gem THEN
          RAISE EXCEPTION 'gem can only be changed via transfer_gems()';
        END IF;
        IF to_jsonb(NEW) ? 'is_admin' AND (to_jsonb(NEW)->>'is_admin') IS DISTINCT FROM (to_jsonb(OLD)->>'is_admin') THEN
          RAISE EXCEPTION 'is_admin is read-only';
        END IF;
        IF to_jsonb(NEW) ? 'is_vip' AND (to_jsonb(NEW)->>'is_vip') IS DISTINCT FROM (to_jsonb(OLD)->>'is_vip') THEN
          RAISE EXCEPTION 'is_vip is read-only';
        END IF;
        IF to_jsonb(NEW) ? 'role' AND (to_jsonb(NEW)->>'role') IS DISTINCT FROM (to_jsonb(OLD)->>'role') THEN
          RAISE EXCEPTION 'role is read-only';
        END IF;
      END IF;
      RETURN NEW;
    END$T$;

    DROP TRIGGER IF EXISTS profiles_block_priv ON public.profiles;
    CREATE TRIGGER profiles_block_priv
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.profiles_block_privileged_columns();
  END IF;
END$$;

-- -------------------------------------------------------------
-- 6. GENERIC OWNER-SCOPED POLICIES for common tables
-- Adjust column names if your schema uses different ones.
-- These are additive — they DROP-IF-EXISTS then recreate.
-- -------------------------------------------------------------
-- POSTS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='posts') THEN
    EXECUTE 'DROP POLICY IF EXISTS "posts read all"   ON public.posts';
    EXECUTE 'DROP POLICY IF EXISTS "posts insert own" ON public.posts';
    EXECUTE 'DROP POLICY IF EXISTS "posts update own" ON public.posts';
    EXECUTE 'DROP POLICY IF EXISTS "posts delete own" ON public.posts';
    EXECUTE 'CREATE POLICY "posts read all"   ON public.posts FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "posts insert own" ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() OR user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "posts update own" ON public.posts FOR UPDATE TO authenticated USING (author_id = auth.uid() OR user_id = auth.uid() OR public.has_role(auth.uid(),''admin''))';
    EXECUTE 'CREATE POLICY "posts delete own" ON public.posts FOR DELETE TO authenticated USING (author_id = auth.uid() OR user_id = auth.uid() OR public.has_role(auth.uid(),''admin''))';
  END IF;
END$$;

-- (Repeat the same pattern for comments / messages / gifts / notifications /
--  followers / transactions / user_settings — column names may differ. Edit
--  this block to match your schema before running.)

-- -------------------------------------------------------------
-- 7. GRANTS for the tables (safety: PostgREST needs these)
-- -------------------------------------------------------------
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','posts','comments','messages','gifts',
    'notifications','followers','transactions','user_settings'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END$$;

-- =============================================================
-- DONE. Verify with:
--   SELECT tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables WHERE schemaname='public';
-- =============================================================
