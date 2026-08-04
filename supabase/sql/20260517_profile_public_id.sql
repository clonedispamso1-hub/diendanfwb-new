-- ============================================================
-- 20260517 — Random public_id for profiles (anti credential-stuffing)
--
-- HOW TO APPLY:
--   Mở Supabase Dashboard → SQL Editor của project cũ
--   (https://supabase.com/dashboard/project/zbuwddjcqdlyijcunwgd/sql/new)
--   paste toàn bộ file này rồi RUN.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_id text;

CREATE OR REPLACE FUNCTION public.gen_profile_public_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- bỏ 0/O/1/I cho dễ đọc
  result text;
  i int;
  tries int := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE public_id = result);
    tries := tries + 1;
    IF tries > 20 THEN
      result := result || substr(md5(random()::text), 1, 4);
      EXIT;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- Backfill toàn bộ user hiện tại
UPDATE public.profiles
SET public_id = public.gen_profile_public_id()
WHERE public_id IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN public_id SET DEFAULT public.gen_profile_public_id(),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_key
  ON public.profiles (public_id);

-- Tự sinh public_id cho user đăng ký mới
CREATE OR REPLACE FUNCTION public.set_profile_public_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id := public.gen_profile_public_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_profile_public_id ON public.profiles;
CREATE TRIGGER trg_set_profile_public_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_public_id();

GRANT EXECUTE ON FUNCTION public.gen_profile_public_id() TO authenticated, service_role;
