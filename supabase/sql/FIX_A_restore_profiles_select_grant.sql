-- =====================================================================
-- FIX A — Restore SELECT grant on public.profiles (Supabase #1 / primary,
--         project gxfxqbhxoghdhokwjpex). Run manually in its SQL editor.
-- ---------------------------------------------------------------------
-- Symptom : GET /rest/v1/profiles -> 401 / 42501 "permission denied for
--           table profiles" for logged-out (anon) visitors.
-- Cause   : live DB drifted from the canonical setup script
--           supabase/sql/INIT_CLEAN_SB1.sql (PHẦN 6, line ~762):
--             GRANT SELECT ON public.profiles TO anon, authenticated;
--           with its existing policy profiles_public_read
--             FOR SELECT TO anon, authenticated USING (true).
-- Scope   : SELECT only. No new policy, no policy change, no
--           INSERT/UPDATE/DELETE, no other roles, no other tables.
-- Safety  : aborts (no change) if RLS is off or the canonical
--           profiles_public_read policy is missing.
-- Idempotent: GRANT is a no-op when already granted.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FIX A aborted: RLS is not enabled on public.profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_public_read' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FIX A aborted: canonical policy profiles_public_read (FOR SELECT) not found';
  END IF;
END $$;

GRANT SELECT ON public.profiles TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Verify afterwards (expect anon + authenticated SELECT, nothing new):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='profiles' ORDER BY 1,2;
