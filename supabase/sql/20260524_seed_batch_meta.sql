-- Cho phép admin quản lý seed account theo batch.
ALTER TABLE public.fake_profiles
  ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seed_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT;

CREATE INDEX IF NOT EXISTS fake_profiles_batch_idx
  ON public.fake_profiles (seed_batch_id);
