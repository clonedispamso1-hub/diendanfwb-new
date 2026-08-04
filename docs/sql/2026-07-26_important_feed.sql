-- =========================================================================
-- Quan Trọng (Important) feed system.
--
-- 1. Add 'important' to the post_category enum so posts can be tagged.
-- 2. Add profiles.can_post_important — per-user permission to compose in
--    the Quan Trọng feed. Admins always pass this check in application code.
-- Idempotent: safe to run more than once.
-- =========================================================================

-- 1. Enum value ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'post_category' AND e.enumlabel = 'important'
  ) THEN
    ALTER TYPE public.post_category ADD VALUE 'important';
  END IF;
END $$;

-- 2. Permission column -----------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_post_important boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_can_post_important
  ON public.profiles(can_post_important)
  WHERE can_post_important = true;
