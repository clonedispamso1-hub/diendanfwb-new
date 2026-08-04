-- Add gender column to profiles (one-time, immutable after first set)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female'));

-- Trigger: prevent updating gender once it has a value
CREATE OR REPLACE FUNCTION public.prevent_gender_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    RAISE EXCEPTION 'Giới tính không thể thay đổi sau khi đã chọn';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_gender_immutable ON public.profiles;
CREATE TRIGGER profiles_gender_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_gender_update();

-- handle_new_user: copy gender from auth metadata if present
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := NEW.raw_user_meta_data->>'username';
  v_full_name text := NEW.raw_user_meta_data->>'full_name';
  v_province text := NEW.raw_user_meta_data->>'province';
  v_gender text := NEW.raw_user_meta_data->>'gender';
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, province, location, gender)
  VALUES (NEW.id, NEW.email, v_username, v_full_name, v_province, v_province, v_gender)
  ON CONFLICT (id) DO UPDATE
    SET username   = COALESCE(EXCLUDED.username,   public.profiles.username),
        full_name  = COALESCE(EXCLUDED.full_name,  public.profiles.full_name),
        province   = COALESCE(EXCLUDED.province,   public.profiles.province),
        location   = COALESCE(EXCLUDED.location,   public.profiles.location),
        gender     = COALESCE(public.profiles.gender, EXCLUDED.gender);
  RETURN NEW;
END;
$$;

-- Block list: hides target_id's content from blocker_id
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, target_id),
  CHECK (blocker_id <> target_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "user_blocks_insert_own" ON public.user_blocks;
CREATE POLICY "user_blocks_insert_own"
  ON public.user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "user_blocks_delete_own" ON public.user_blocks;
CREATE POLICY "user_blocks_delete_own"
  ON public.user_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_target ON public.user_blocks(target_id);

-- Reports: ensure 'context_text' column exists for "Khác" custom messages
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS context_text text;

-- Drop old reason CHECK and re-add with 'other'
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('spam','scam','fake','other'));
