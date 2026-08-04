-- =====================================================================
-- 2026-07-02 · Connections module — seed account extensions
-- =====================================================================
-- Adds two OPTIONAL columns used by the new "Kết nối" page and the
-- admin Seed Manager sheet. The UI already falls back gracefully when
-- these columns are missing, so the migration is safe to run whenever.
--
--   seed_distance_km   numeric   — displayed distance (km) for a seed
--                                    account. NULL → app derives a stable
--                                    pseudo-distance from the user id.
--   seed_hidden        boolean   — admin toggle to hide a seed account
--                                    from the Connections list without
--                                    deleting the row.
--
-- Both columns only make sense when profiles.is_seed_account = true, but
-- we do NOT enforce that with a constraint so admins can freely toggle.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seed_distance_km numeric(6, 2),
  ADD COLUMN IF NOT EXISTS seed_hidden      boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.seed_distance_km IS
  'Displayed distance (km) for seed accounts on the Kết nối page. NULL → derived client-side.';
COMMENT ON COLUMN public.profiles.seed_hidden IS
  'Admin toggle to hide a seed account from the Kết nối list without deleting it.';

-- Optional helper index for the Connections list ordering.
CREATE INDEX IF NOT EXISTS profiles_connections_idx
  ON public.profiles (is_online DESC, last_seen DESC)
  WHERE COALESCE(seed_hidden, false) = false;

-- No GRANT changes required — public.profiles already exposes these
-- columns via the existing SELECT/UPDATE policies used by the app.
