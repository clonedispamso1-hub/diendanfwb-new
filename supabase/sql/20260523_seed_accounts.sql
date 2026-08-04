-- Run this once in Supabase SQL editor to enable Seed Account (FWB Nearby).
-- Seed accounts adapt location to the viewer; no real location is stored.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_seed_account BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_is_seed_account_idx
  ON public.profiles (is_seed_account)
  WHERE is_seed_account = TRUE;
