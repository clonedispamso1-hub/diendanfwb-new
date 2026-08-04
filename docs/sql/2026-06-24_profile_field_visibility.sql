-- Run this once in the Supabase SQL editor (project: zbuwddjcqdlyijcunwgd)
-- Adds per-field visibility columns used by the redesigned IntroCard.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_visibility     TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS gender_visibility       TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS birthday_visibility     TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS zodiac_visibility       TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS relationship_visibility TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS goal_visibility         TEXT DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_values_chk') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_visibility_values_chk
      CHECK (
        location_visibility     IN ('public','friends','private') AND
        gender_visibility       IN ('public','friends','private') AND
        birthday_visibility     IN ('public','friends','private') AND
        zodiac_visibility       IN ('public','friends','private') AND
        relationship_visibility IN ('public','friends','private') AND
        goal_visibility         IN ('public','friends','private')
      );
  END IF;
END $$;
