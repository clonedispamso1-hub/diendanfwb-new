-- Premium Onboarding Flow — add columns to profiles
-- Run this once on the production Supabase DB.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS zodiac text,
  ADD COLUMN IF NOT EXISTS relationship_status text,
  ADD COLUMN IF NOT EXISTS personality_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS communication_styles text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS target_gender text,
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'vi';

-- Ensure the avatars storage bucket exists & is public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;