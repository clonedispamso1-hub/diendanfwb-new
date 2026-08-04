-- Contact tab: Facebook link + Zalo phone number columns on profiles.
-- Run once on Supabase project zbuwddjcqdlyijcunwgd.
alter table public.profiles
  add column if not exists facebook text,
  add column if not exists zalo text;
