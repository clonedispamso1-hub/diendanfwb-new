-- Thêm các cột phone / email / age cho profiles để hỗ trợ luồng FWB tối giản.
-- bio đã tồn tại sẵn. Phone/email là dữ liệu riêng tư: client KHÔNG được
-- truy vấn các cột này khi xem profile của người khác (PROFILE_COLS trong
-- src/components/candy/profile-page.tsx không chứa phone/email).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age   smallint,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_age_range_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_age_range_chk
      CHECK (age IS NULL OR (age >= 18 AND age <= 100));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON public.profiles (phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;
