-- ROOT CAUSE VERIFIED 2026-07-24
-- Auth signup returns PostgreSQL 23502 because profiles.public_id is NOT NULL
-- while the profile INSERT produces NULL. This repair is safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.gen_profile_public_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  character_index integer;
BEGIN
  LOOP
    candidate := '';
    FOR character_index IN 1..6 LOOP
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE public_id = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_public_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := public.gen_profile_public_id();
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET public_id = public.gen_profile_public_id()
WHERE public_id IS NULL OR btrim(public_id) = '';

ALTER TABLE public.profiles
  ALTER COLUMN public_id SET DEFAULT public.gen_profile_public_id(),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_key
  ON public.profiles (public_id);

DROP TRIGGER IF EXISTS trg_set_profile_public_id ON public.profiles;
CREATE TRIGGER trg_set_profile_public_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_public_id();

GRANT EXECUTE ON FUNCTION public.gen_profile_public_id() TO authenticated, service_role;

-- Verification: the trigger and default must both be present.
SELECT
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'public_id';

SELECT
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
ORDER BY trigger_name;