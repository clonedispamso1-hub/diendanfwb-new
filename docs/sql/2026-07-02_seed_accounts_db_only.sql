-- =====================================================================
-- 2026-07-02 · Seed Accounts — DATABASE-ONLY virtual account system
-- =====================================================================
-- Goal: Seed Accounts are pure database records. They do NOT use Supabase
-- Authentication, they are NOT rows in auth.users, and they are NOT rows in
-- public.profiles. Because they live in their own table with no
-- device-limit / fingerprint / anti-spam triggers, administrators can create
-- an UNLIMITED number of them without ever being blocked.
--
-- Real users keep using Supabase Auth + public.profiles exactly as before.
-- The 2-accounts-per-device limit keeps applying only to real users.
--
-- ▶ Run this ONCE in the Supabase SQL editor (project zbuwddjcqdlyijcunwgd).
--   It is idempotent and safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seed_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text        NOT NULL DEFAULT 'Người dùng',
  username      text,                       -- display only, NEVER used for login
  avatar        text,
  bio           text,
  gender        text        NOT NULL DEFAULT 'female',
  age           integer     NOT NULL DEFAULT 22,
  distance_km   numeric(6,2) NOT NULL DEFAULT 2,
  is_online     boolean     NOT NULL DEFAULT true,   -- Online / Offline status
  is_active     boolean     NOT NULL DEFAULT true,   -- Active (true) / Hidden (false)
  province      text,                       -- optional location for nearby parity
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seed_accounts IS
  'Database-only virtual (seed) accounts. No auth.users, no profiles row, no device/fingerprint/anti-spam triggers. Managed exclusively by admins.';

-- ---------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_accounts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_accounts_updated_at ON public.seed_accounts;
CREATE TRIGGER trg_seed_accounts_updated_at
  BEFORE UPDATE ON public.seed_accounts
  FOR EACH ROW EXECUTE FUNCTION public.seed_accounts_touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS seed_accounts_active_idx
  ON public.seed_accounts (is_active, is_online DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS seed_accounts_province_idx
  ON public.seed_accounts (province)
  WHERE is_active = true;

-- ---------------------------------------------------------------------
-- 4. Admin helper (SECURITY DEFINER so RLS never recurses)
--    Real users are admins when public.profiles.is_admin = true.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_seed_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Grants (PostgREST needs explicit grants on the public schema)
-- ---------------------------------------------------------------------
GRANT SELECT ON public.seed_accounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seed_accounts TO authenticated;
GRANT ALL ON public.seed_accounts TO service_role;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
--    - Anyone can READ active seeds (so they appear like real users in the
--      Feed / Connections). Admins can also read hidden seeds.
--    - Only admins can INSERT / UPDATE / DELETE. No device / fingerprint /
--      rate-limit checks apply -> unlimited creation.
-- ---------------------------------------------------------------------
ALTER TABLE public.seed_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seed_accounts_read       ON public.seed_accounts;
DROP POLICY IF EXISTS seed_accounts_admin_ins  ON public.seed_accounts;
DROP POLICY IF EXISTS seed_accounts_admin_upd  ON public.seed_accounts;
DROP POLICY IF EXISTS seed_accounts_admin_del  ON public.seed_accounts;

CREATE POLICY seed_accounts_read ON public.seed_accounts
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_seed_admin());

CREATE POLICY seed_accounts_admin_ins ON public.seed_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_seed_admin());

CREATE POLICY seed_accounts_admin_upd ON public.seed_accounts
  FOR UPDATE TO authenticated
  USING (public.is_seed_admin())
  WITH CHECK (public.is_seed_admin());

CREATE POLICY seed_accounts_admin_del ON public.seed_accounts
  FOR DELETE TO authenticated
  USING (public.is_seed_admin());

-- =====================================================================
-- 7. FUTURE SCALABILITY (reference only — NOT created here)
-- =====================================================================
-- Seed accounts can later create posts / comments / messages / reactions /
-- follows WITHOUT Supabase Auth by making content tables author-agnostic:
--
--   author_id   uuid   -- profiles.id OR seed_accounts.id
--   author_kind text   -- 'user' | 'seed'
--
-- Resolve the display identity in the app/view layer by joining on
-- author_kind. This keeps seed content fully decoupled from auth.users.
-- =====================================================================
