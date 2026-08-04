-- =====================================================================
-- Onboarding Multi-Step: thêm cột interests (sở thích, tối đa 3) và
-- current_job (công việc hiện tại — KHÔNG thể đổi sau khi lưu).
-- Idempotent. Chạy thủ công trong Supabase SQL Editor cho DB cũ.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests   text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS current_job text;

-- Giới hạn tối đa 3 sở thích.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_interests_max3_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_interests_max3_chk
      CHECK (interests IS NULL OR array_length(interests, 1) IS NULL OR array_length(interests, 1) <= 3);
  END IF;
END $$;

-- Trigger khoá current_job sau khi đã set (giống cơ chế gender).
CREATE OR REPLACE FUNCTION public.lock_current_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.current_job IS NOT NULL
     AND OLD.current_job <> ''
     AND NEW.current_job IS DISTINCT FROM OLD.current_job
  THEN
    RAISE EXCEPTION 'CURRENT_JOB_LOCKED: Công việc đã được khoá, không thể chỉnh sửa.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_lock_current_job ON public.profiles;
CREATE TRIGGER trg_lock_current_job
  BEFORE UPDATE OF current_job ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_current_job();
